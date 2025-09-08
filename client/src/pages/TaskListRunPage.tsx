import { useMemo, useRef, useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { checkinApi } from "@/lib/api";

type TemplateItem = {
  id: number;
  title: string;
  description?: string | null;
  photoRequired?: boolean;
  photoCount?: number | null;
};
type CheckInStatus = {
  checkedIn: boolean;
  storeId?: number;
  latitude?: number;
  longitude?: number;
  at?: string;
};

type TemplateSection = { title: string; items: TemplateItem[] };

export default function TaskListRunPage() {
  const [, params] = useRoute<{ id: string }>("/tasklists/run/:id");
  const listId = params ? Number(params.id) : 0;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isAdmin = user?.role === "master_admin" || user?.role === "admin";
  const isManager = user?.role === "store_manager";
  const isEmployee = user?.role === "employee";
  const mustCheckIn = isEmployee || isManager; // admins bypass check-in

  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(
    isAdmin ? null : (user?.storeId ?? null),
  );

  // ---- list meta
  const { data: list } = useQuery<{ id: number; name: string }>({
  queryKey: ["/api/task-lists", listId],
  enabled: Number.isFinite(listId),
  queryFn: async () => {
    const r = await fetch(`/api/task-lists/${listId}`, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<{ id: number; name: string }>;
  },
});


  // ---- templates
  const { data: templates = [] } = useQuery<TemplateItem[]>({
  queryKey: ["/api/task-lists", listId, "templates"],
  enabled: Number.isFinite(listId),
  queryFn: async () => {
    const r = await fetch(`/api/task-lists/${listId}/templates`, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<TemplateItem[]>;
  },
});

  const [state, setState] = useState<Runtime>({});
  const [runPrimed, setRunPrimed] = useState(false);

  // ---- now useEffect can safely use `initial`
  useEffect(() => {
    if (!templates || templates.length === 0) return;

    const next: Runtime = {};
    for (const t of templates) {
      next[t.id] = {
        taskId: undefined,
        required: Math.max(0, Number(t.photoCount ?? 0)),
        photos: 0,
        checked: false,
      };
    }
    setState(next);
  }, [templates]); // <-- remove 'initial' from dependencies


  // ---- admins: store list
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetch(`/api/stores`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });


  // ---- check-in status
  const { data: checkin, refetch: refetchCheckin } = useQuery<CheckInStatus>({
    queryKey: ["/api/checkins/me"],
    queryFn: () => checkinApi.status(),
    staleTime: 10_000,
  });

  const handleCompleteRun = async () => {
    // Check if all tasks meet requirements
    const incompleteTasks = Object.values(state).filter(
      (t) => !t.checked || (t.required > 0 && t.photos < t.required)
    );

    if (incompleteTasks.length > 0) {
      toast({
        title: "Incomplete tasks",
        description: "You need to complete all tasks and upload required photos.",
        variant: "destructive",
      });
      return;
    }

    // All tasks are ready, ensure check-in
    const ok = await ensureCheckedIn();
    if (!ok) return;

    // Complete all tasks
    for (const task of Object.values(state)) {
      if (task.taskId) {
        completeTask.mutate(task.taskId);
      }
    }

    toast({ title: "All tasks completed!" });
  };

  const doCheckIn = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      if (!selectedStoreId) throw new Error("Store ID not selected");
      return checkinApi.checkInToStore(selectedStoreId, coords);
    },
    onSuccess: () => {
      toast({ title: "Checked in" });
      refetchCheckin();
    },
    onError: (e: any) => {
      toast({
        title: "Check-in failed",
        description: String(e?.message || e),
        variant: "destructive",
      });
    },
  });

  const doCheckOut = useMutation({
    mutationFn: () => checkinApi.checkOut(),
    onSuccess: () => {
      toast({ title: "Checked out" });
      refetchCheckin();
    },
  });

  // ---- one flat section (keeps your UI)
  const sections: TemplateSection[] = useMemo(
    () => [{ title: "TASKS", items: templates }],
    [templates]
  );

  // ---- runtime per template
  type Runtime = {
    [templateId: number]: {
      taskId?: number;
      required: number;
      photos: number;
      checked: boolean;
    };
  };
 // true when today's tasks exist

  // ---- ENSURE today's tasks exist (no manual run needed)
  const { data: todayTasks = [] } = useQuery<any[]>({
  queryKey: ["/api/task-lists", listId, "today", selectedStoreId],
  enabled: Number.isFinite(listId) && !!(selectedStoreId ?? user?.storeId),
  queryFn: async () => {
    const sid = selectedStoreId ?? user?.storeId;
    const r = await fetch(`/api/task-lists/${listId}/tasks?storeId=${sid}`, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<any[]>;
  },
});
  useEffect(() => {
    const next: Runtime = {};
    for (const t of todayTasks || []) {
      const tid = Number(t.templateId);
      if (!tid) continue;
      next[tid] = {
        taskId: Number(t.id),
        required: Math.max(0, Number(t.photoCount ?? 0)),
        photos: Number(t.photosUploaded ?? 0),
        checked: t.status === "completed",
      };
    }
    setState(next);
    setRunPrimed(todayTasks.length > 0);
  }, [todayTasks]); // <-- remove 'initial' from dependencies



  const totals = useMemo(() => {
    const ids = Object.keys(state);
    const done = ids.filter((k) => state[Number(k)]?.checked).length;
    return { total: ids.length, done };
  }, [state]);

  const canComplete =
    runPrimed &&
    totals.total > 0 &&
    totals.done === totals.total &&
    Object.values(state).every((t) => t.photos >= t.required);

  // const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
  //   Promise.resolve({
  //     latitude: 33.480518,   // your latitude
  //     longitude: -86.813564, // your longitude
  //   });


  const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

  // Ensure check-in (for employees/managers). Try once automatically with GPS.
  const ensureCheckedIn = async (): Promise<boolean> => {
    if (!mustCheckIn) return true;
    if (checkin?.checkedIn) return true;

    const coords = await getCoords();
    if (coords.latitude != null && coords.longitude != null) {
      try {
        await doCheckIn.mutateAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        // If mutateAsync succeeds, consider the user checked in
        return true;
      } catch {
        // fall-through to toast
      }
    }

    toast({
      title: "Check-in required",
      description:
        "You must be on store premises to upload photos or complete tasks.",
      variant: "destructive",
    });
    return false;
  };

  // ---- upload photo (gated by check-in)
  const uploadPhoto = useMutation({
    mutationFn: async (vars: { taskId: number; file: File }) => {
      // require check-in
      const ok = await ensureCheckedIn();
      if (!ok) throw new Error("Not checked in");

      const coords = await getCoords();
      const fd = new FormData();
      fd.append("photo", vars.file);
      if (coords.latitude != null)
        fd.append("latitude", String(coords.latitude));
      if (coords.longitude != null)
        fd.append("longitude", String(coords.longitude));
      const r = await fetch(`/api/tasks/${vars.taskId}/photos`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_out, { taskId }) => {
      setState((s) => {
        const n: Runtime = { ...s };
        for (const key of Object.keys(n)) {
          const t = n[Number(key)];
          if (t.taskId === taskId) t.photos = (t.photos ?? 0) + 1;
        }
        return n;
      });
      setRunPrimed(true);
    },
    onError: (e: any) => {
      const msg = (() => {
        try {
          const parsed = JSON.parse(String(e?.message ?? ""));
          return parsed?.message || String(e?.message || e);
        } catch {
          return String(e?.message || e);
        }
      })();
      toast({
        title: "Upload failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // ---- complete task (also requires check-in if photos were required)
  const completeTask = useMutation({
    mutationFn: async (taskId: number) => {
      const ok = await ensureCheckedIn();
      if (!ok) throw new Error("Not checked in");

      const coords = await getCoords();
      const r = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_out, taskId) => {
      setState((s) => {
        const n: Runtime = { ...s };
        for (const key of Object.keys(n)) {
          const t = n[Number(key)];
          if (t.taskId === taskId) t.checked = true;
        }
        return n;
      });
    },
    onError: (e: any) => {
      const msg = (() => {
        try {
          const parsed = JSON.parse(String(e?.message ?? ""));
          return parsed?.message || String(e?.message || e);
        } catch {
          return String(e?.message || e);
        }
      })();
      toast({
        title: "Could not complete task",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // ---- ensure-task (lazy create)
  const ensureTask = useMutation({
    mutationFn: async (vars: { templateId: number }) => {
      const sid = selectedStoreId ?? user?.storeId;
      const r = await fetch(
        `/api/task-lists/${listId}/ensure-task${sid ? `?storeId=${sid}` : ""}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: vars.templateId }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<any>;
    },
    onSuccess: (task, { templateId }) => {
      setState((s) => ({
        ...s,
        [templateId]: {
          ...(s[templateId] || {
            required: Number(task.photoCount ?? 0),
            photos: 0,
            checked: false,
          }),
          taskId: Number(task.id),
          required: Number(task.photoCount ?? s[templateId]?.required ?? 0),
          photos: Number(task.photosUploaded ?? s[templateId]?.photos ?? 0),
        },
      }));
      setRunPrimed(true);
    },
    onError: (e: any) =>
      toast({
        title: "Could not start task",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  // ---- preview + retake
  const [preview, setPreview] = useState<{
    templateId: number;
    file: File;
    url: string;
  } | null>(null);

  const confirmUploadFromPreview = async () => {
    if (!preview) return;
    try {
      const ok = await ensureCheckedIn();
      if (!ok) return;

      // ensure a task exists for this template today
      const t = state[preview.templateId];
      const ensured = t?.taskId
        ? { id: t.taskId }
        : await ensureTask.mutateAsync({ templateId: preview.templateId });

      uploadPhoto.mutate({ taskId: Number(ensured.id), file: preview.file });
    } finally {
      URL.revokeObjectURL(preview?.url || "");
      setPreview(null);
    }
  };

  // ---- input refs
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const openFile = (templateId: number) =>
    fileInputs.current[templateId]?.click();

  // ---- checkbox handler (ensures task when needed)
  const toggleCheck = async (templateId: number) => {
    const t = state[templateId];
    if (!t?.taskId) {
      try {
        const created = await ensureTask.mutateAsync({ templateId });
        setState((s) => ({
          ...s,
          [templateId]: {
            ...(s[templateId] || {
              required: created.photoCount ?? 0,
              photos: 0,
              checked: false,
            }),
            taskId: created.id,
          },
        }));
      } catch {
        return;
      }
    }
    const cur = state[templateId];
    if (cur.required > 0 && cur.photos < cur.required) return;

    // require check-in to complete
    const ok = await ensureCheckedIn();
    if (!ok) return;

    if (!cur.checked) completeTask.mutate(cur.taskId!);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setLocation("/task-lists")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">
              {list?.name ?? "Task List"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Upload photos and complete items
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select
              value={selectedStoreId != null ? String(selectedStoreId) : ""}
              onValueChange={(v) => setSelectedStoreId(Number(v))}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Choose store..." />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(isAdmin || isManager) && (
            <Button
              variant="outline"
              disabled
              title="Runs are automatic now; employees can start working immediately."
            >
              Run not required
            </Button>
          )}

          <Button
            disabled={!canComplete}
            variant={canComplete ? "default" : "outline"}
            onClick={handleCompleteRun} // <-- attach the function here
          >
            <Check className="w-4 h-4 mr-2" />
            Complete Run
          </Button>

        </div>
      </div>

      {/* check-in banner (employees/managers) */}
      {mustCheckIn && (
        <Card className="p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">
                {checkin?.checkedIn ? "Checked in" : "Check in required"}
              </div>
              <div className="text-muted-foreground">
                {checkin?.checkedIn
                  ? "You can upload photos and complete tasks."
                  : "You must be on store premises (GPS) to upload photos or mark items complete."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {checkin?.checkedIn ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => doCheckOut.mutate()}
                  disabled={doCheckOut.isPending}
                >
                  Check out
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={async () => {
                    const coords = await getCoords();
                    if (coords.latitude != null && coords.longitude != null) {
                      doCheckIn.mutate({
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                      });
                    } else {
                      toast({
                        title: "Location required",
                        description:
                          "Enable location and try again near the store.",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={doCheckIn.isPending}
                >
                  {doCheckIn.isPending ? "Checking in..." : "Check in"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            Progress {totals.done}/{totals.total}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600"
            style={{
              width: `${(totals.done / Math.max(1, totals.total)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* sections */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <Card key={sec.title} className="p-3">
            <div className="text-sm font-medium mb-2">{sec.title}</div>

            <div className="space-y-2">
              {sec.items.map((it) => {
                const r = state[it.id] || {
                  required: 0,
                  photos: 0,
                  checked: false,
                };
                const needs =
                  (it.photoRequired ?? false) || (r.required ?? 0) > 0;
                const disabled = needs && r.photos < (r.required ?? 0);
                const left = Math.max(0, (r.required ?? 0) - (r.photos ?? 0));
                return (
                  <div
                    key={it.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <label
                      className={`flex items-start gap-3 select-none ${disabled ? "opacity-70" : ""}`}
                      title={
                        disabled
                          ? `Upload ${left} more photo${left === 1 ? "" : "s"} to enable`
                          : "Mark complete"
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={r.checked}
                        disabled={disabled || completeTask.isPending}
                        onChange={() => toggleCheck(it.id)}
                      />
                      <div>
                        <div className="text-sm flex items-center gap-1">
                          {it.title}
                          {disabled && (
                            <Lock className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </div>
                        {needs && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Photos required: {r.photos}/{r.required}
                          </div>
                        )}
                        {it.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {it.description}
                          </div>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => (fileInputs.current[it.id] = el)}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          setPreview({ templateId: it.id, file, url });
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputs.current[it.id]?.click()}
                        disabled={uploadPhoto.isPending}
                        title={
                          left > 0 ? `Add photo (${left} left)` : "Add photo"
                        }
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Add Photo
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Photo preview modal (preview + retake) */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow max-w-md w-full p-4">
            <div className="font-medium mb-2">Preview</div>
            <img
              src={preview.url}
              alt="preview"
              className="w-full rounded border"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="outline"
                onClick={() => {
                  URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
              >
                Retake
              </Button>
              <Button
                onClick={confirmUploadFromPreview}
                disabled={uploadPhoto.isPending}
              >
                {uploadPhoto.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
