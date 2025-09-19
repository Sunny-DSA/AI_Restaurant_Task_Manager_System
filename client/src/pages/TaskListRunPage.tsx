// client/src/pages/TasklistsRunpage.tsx
import { useMemo, useRef, useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Lock, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { checkinApi } from "@/lib/api";

/* =========================
   Types
========================= */
type TemplateItem = {
  id: number;
  title: string;
  description?: string | null;
  photoRequired?: boolean;
  photoCount?: number | null;

  // optional ordering hints if API exposes them
  position?: number | null;
  sortOrder?: number | null;
  order?: number | null;
  index?: number | null;
  createdAt?: string | null;
};

type TemplateSection = { title: string; items: TemplateItem[] };

type TodayTask = {
  id: number;
  templateId: number;
  status: string;
  photoCount?: number | null;
  photosUploaded?: number | null;
};

type CheckInStatus = {
  checkedIn: boolean;
  storeId?: number;
  latitude?: number;
  longitude?: number;
  at?: string;
};

type Runtime = {
  [templateId: number]: {
    taskId?: number;
    required: number;
    photos: number;
    checked: boolean;
  };
};

/* =========================
   Ordering helper (stable)
========================= */
function orderTemplates(items: TemplateItem[]): TemplateItem[] {
  return [...items].sort((a, b) => {
    const aPos = (a.position ?? a.sortOrder ?? a.order ?? a.index) ?? Number.POSITIVE_INFINITY;
    const bPos = (b.position ?? b.sortOrder ?? b.order ?? b.index) ?? Number.POSITIVE_INFINITY;
    if (aPos !== bPos) return aPos - bPos;

    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;

    return Number(a.id) - Number(b.id);
  });
}

/* =========================
   Component
========================= */
export default function TaskListRunPage() {
  // route: /tasklists/run/:id
  const [, params] = useRoute<{ id: string }>("/tasklists/run/:id");
  const listId = params ? Number(params.id) : 0;
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role === "master_admin" || user?.role === "admin";
  const isManager = user?.role === "store_manager";
  const isEmployee = user?.role === "employee";
  const mustCheckIn = isEmployee || isManager;

  // Admin must choose; others default to their store
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(
    isAdmin ? null : (user?.storeId ?? null),
  );

  // filters
  const [showMode, setShowMode] = useState<"all" | "needs" | "incomplete" | "completed">("all");
  const [q, setQ] = useState("");

  // preview / lightbox
  const [preview, setPreview] = useState<{ templateId: number; url: string; file?: File; readOnly?: boolean } | null>(null);

  // session thumbnails (per taskId)
  const [sessionPhotos, setSessionPhotos] = useState<Record<number, string[]>>({});

  // ensure today's run was primed
  const [runPrimed, setRunPrimed] = useState(false);

  /* -------- list meta -------- */
  const { data: list } = useQuery<{ id: number; name: string }>({
    queryKey: ["/api/task-lists", listId],
    enabled: Number.isFinite(listId),
    queryFn: async () => {
      const r = await fetch(`/api/task-lists/${listId}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  /* -------- templates -------- */
  const {
    data: templates = [],
    isLoading: templatesLoading,
    isFetching: templatesFetching,
  } = useQuery<TemplateItem[]>({
    queryKey: ["/api/task-lists", listId, "templates"],
    enabled: Number.isFinite(listId),
    queryFn: async () => {
      const r = await fetch(`/api/task-lists/${listId}/templates`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 15_000,
  });

  const templatesOrdered = useMemo(() => orderTemplates(templates), [templates]);

  /* -------- initial runtime by templates -------- */
  const initialRuntime: Runtime = useMemo(() => {
    const next: Runtime = {};
    for (const t of templatesOrdered) {
      next[t.id] = {
        taskId: undefined,
        required: Math.max(0, Number(t.photoCount ?? 0)),
        photos: 0,
        checked: false,
      };
    }
    return next;
  }, [templatesOrdered]);

  const [state, setState] = useState<Runtime>({});
  useEffect(() => setState(initialRuntime), [initialRuntime]);

  /* -------- stores (admins only) -------- */
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetch(`/api/stores`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  /* -------- check-in status -------- */
  const { data: checkin, refetch: refetchCheckin } = useQuery<CheckInStatus>({
    queryKey: ["/api/checkins/me"],
    queryFn: () => checkinApi.status(),
    staleTime: 10_000,
  });

  /* -------- today’s tasks -------- */
  const {
    data: todayTasks = [],
    isLoading: todayLoading,
    isFetching: todayFetching,
  } = useQuery<TodayTask[]>({
    queryKey: ["/api/task-lists", listId, "today", selectedStoreId],
    enabled: Number.isFinite(listId) && !!(selectedStoreId ?? user?.storeId),
    queryFn: async () => {
      const sid = selectedStoreId ?? user?.storeId;
      const r = await fetch(`/api/task-lists/${listId}/tasks?storeId=${sid}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!todayTasks || todayTasks.length === 0) {
      setRunPrimed(false);
      return;
    }
    const next: Runtime = { ...initialRuntime };
    for (const t of todayTasks) {
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
    setRunPrimed(true);
  }, [todayTasks, initialRuntime]);

  /* -------- helpers -------- */
  const sections: TemplateSection[] = useMemo(
    () => [{ title: "TASKS", items: templatesOrdered }],
    [templatesOrdered],
  );

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

  const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

  const ensureCheckedIn = async (): Promise<boolean> => {
    if (!mustCheckIn) return true;
    if (checkin?.checkedIn) return true;
    const coords = await getCoords();
    if (coords.latitude != null && coords.longitude != null) {
      try {
        await doCheckIn.mutateAsync({ latitude: coords.latitude, longitude: coords.longitude });
        return true;
      } catch {}
    }
    toast({
      title: "Check-in required",
      description: "You must be on store premises to upload photos or complete tasks.",
      variant: "destructive",
    });
    return false;
  };

  /* -------- mutations -------- */
  const doCheckIn = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      if (!selectedStoreId) throw new Error("Store ID not selected");
      return checkinApi.checkInToStore(selectedStoreId, coords);
    },
    onSuccess: () => {
      toast({ title: "Checked in" });
      refetchCheckin();
    },
    onError: (e: any) =>
      toast({ title: "Check-in failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const doCheckOut = useMutation({
    mutationFn: () => checkinApi.checkOut(),
    onSuccess: () => {
      toast({ title: "Checked out" });
      refetchCheckin();
    },
  });

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
      return r.json() as Promise<TodayTask>;
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
      toast({ title: "Could not start task", description: String(e?.message || e), variant: "destructive" }),
  });

  const uploadPhoto = useMutation({
    mutationFn: async (vars: { taskId: number; file: File }) => {
      const entry = Object.values(state).find((v) => v.taskId === vars.taskId);
      if (entry && entry.required > 0 && entry.photos >= entry.required) {
        throw new Error(`Upload limit reached (${entry.required}).`);
      }
      const ok = await ensureCheckedIn();
      if (!ok) throw new Error("Not checked in");

      const coords = await getCoords();
      const fd = new FormData();
      fd.append("photo", vars.file);
      if (coords.latitude != null) fd.append("latitude", String(coords.latitude));
      if (coords.longitude != null) fd.append("longitude", String(coords.longitude));

      const r = await fetch(`/api/tasks/${vars.taskId}/photos`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ photosUploaded?: number; required?: number }>;
    },
    onSuccess: (out, { taskId, file }) => {
      setState((s) => {
        const n: Runtime = { ...s };
        for (const key of Object.keys(n)) {
          const t = n[Number(key)];
          if (t.taskId === taskId) {
            const req = Number(out?.required ?? t.required ?? 0);
            const have = Number(out?.photosUploaded ?? (t.photos ?? 0) + 1);
            t.required = req;
            t.photos = Math.min(req || Infinity, have);
          }
        }
        return n;
      });

      const url = URL.createObjectURL(file);
      setSessionPhotos((g) => ({ ...g, [taskId]: [...(g[taskId] || []), url] }));
      setRunPrimed(true);
    },
    onError: (e: any) => {
      let msg = String(e?.message || e);
      try {
        const parsed = JSON.parse(msg);
        msg = parsed?.message || msg;
      } catch {}
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    },
  });

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
      let msg = String(e?.message || e);
      try {
        const parsed = JSON.parse(msg);
        msg = parsed?.message || msg;
      } catch {}
      toast({ title: "Could not complete task", description: msg, variant: "destructive" });
    },
  });

  /* -------- handlers -------- */
  const handleCompleteRun = async () => {
    const incomplete = Object.values(state).filter(
      (t) => !t.checked || (t.required > 0 && t.photos < t.required),
    );
    if (incomplete.length > 0) {
      toast({
        title: "Incomplete tasks",
        description: "You need to complete all tasks and upload required photos.",
        variant: "destructive",
      });
      return;
    }
    const ok = await ensureCheckedIn();
    if (!ok) return;

    for (const task of Object.values(state)) {
      if (task.taskId && !task.checked) completeTask.mutate(task.taskId);
    }
    toast({ title: "All tasks completed!" });
  };

  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const openFile = (templateId: number) => fileInputs.current[templateId]?.click();

  const toggleCheck = async (templateId: number) => {
    const t = state[templateId];
    if (!t?.taskId) {
      try {
        const created = await ensureTask.mutateAsync({ templateId });
        setState((s) => ({
          ...s,
          [templateId]: {
            ...(s[templateId] || { required: created.photoCount ?? 0, photos: 0, checked: false }),
            taskId: created.id,
          },
        }));
      } catch {
        return;
      }
    }
    const cur = state[templateId];
    if (cur.required > 0 && cur.photos < cur.required) return;

    const ok = await ensureCheckedIn();
    if (!ok) return;

    if (!cur.checked) completeTask.mutate(cur.taskId!);
  };

  const confirmUploadFromPreview = async () => {
    if (!preview) return;
    try {
      if (preview.readOnly || !preview.file) {
        try { URL.revokeObjectURL(preview.url); } catch {}
        setPreview(null);
        return;
      }

      const ok = await ensureCheckedIn();
      if (!ok) return;

      const rt = state[preview.templateId];
      if (rt && rt.required > 0 && rt.photos >= rt.required) {
        toast({
          title: "Upload limit reached",
          description: `This task already has ${rt.photos}/${rt.required} photos.`,
          variant: "destructive",
        });
        return;
      }

      const ensured = rt?.taskId
        ? { id: rt.taskId }
        : await ensureTask.mutateAsync({ templateId: preview.templateId });

      await uploadPhoto.mutateAsync({ taskId: Number(ensured.id), file: preview.file });
    } finally {
      try { URL.revokeObjectURL(preview.url); } catch {}
      setPreview(null);
    }
  };

  /* -------- filters -------- */
  function filterItems(items: TemplateItem[]) {
    return items.filter((it) => {
      const r = state[it.id] || { required: 0, photos: 0, checked: false };
      const needs = (it.photoRequired ?? false) || (r.required ?? 0) > 0;
      const incomplete = !r.checked;
      const matchesQ = q.trim()
        ? `${it.title} ${it.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())
        : true;

      if (!matchesQ) return false;
      if (showMode === "needs") return needs;
      if (showMode === "incomplete") return incomplete;
      if (showMode === "completed") return r.checked;
      return true;
    });
  }

  /* -------- UI helpers -------- */
  const safeBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/task-lists");
  };

  const loading = templatesLoading || todayLoading || templatesFetching || todayFetching;

  /* =========================
     Render
  ========================= */
  return (
    // add bottom padding so the fixed footer never hides the last row
    <div className="p-4 md:p-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={safeBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{list?.name ?? "Task List"}</h2>
            <p className="text-sm text-muted-foreground">Upload photos and complete items</p>
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

          <Button
            disabled={!canComplete}
            variant={canComplete ? "default" : "outline"}
            onClick={handleCompleteRun}
          >
            <Check className="w-4 h-4 mr-2" />
            Complete Run
          </Button>
        </div>
      </div>

      {/* Check-in banner */}
      {mustCheckIn && (
        <Card className="p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{checkin?.checkedIn ? "Checked in" : "Check in required"}</div>
              <div className="text-muted-foreground">
                {checkin?.checkedIn
                  ? "You can upload photos and complete tasks."
                  : "You must be on store premises (GPS) to upload photos or mark items complete."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {checkin?.checkedIn ? (
                <Button variant="outline" size="sm" onClick={() => doCheckOut.mutate()} disabled={doCheckOut.isPending}>
                  Check out
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={async () => {
                    const coords = await getCoords();
                    if (coords.latitude != null && coords.longitude != null) {
                      doCheckIn.mutate({ latitude: coords.latitude, longitude: coords.longitude });
                    } else {
                      toast({
                        title: "Location required",
                        description: "Enable location and try again near the store.",
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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <div className="flex gap-1">
          {[
            { k: "all", label: "All" },
            { k: "needs", label: "Needs Photo" },
            { k: "incomplete", label: "Incomplete" },
            { k: "completed", label: "Completed" },
          ].map((b) => (
            <Button
              key={b.k}
              size="sm"
              variant={showMode === (b.k as any) ? "default" : "outline"}
              onClick={() => setShowMode(b.k as any)}
              className="h-8"
            >
              {b.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto w-full sm:w-[300px]">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search subtasks…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Progress {totals.done}/{totals.total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600"
            style={{ width: `${(totals.done / Math.max(1, totals.total)) * 100}%` }}
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <Card className="p-3 mb-4">
          <div className="animate-pulse space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </Card>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((sec) => {
          const items = filterItems(sec.items);
          return (
            <Card key={sec.title} className="p-3">
              <div className="text-sm font-medium mb-2">{sec.title}</div>

              {items.length === 0 && !loading && (
                <div className="text-sm text-muted-foreground">Nothing to show with current filters.</div>
              )}

              <div className="space-y-2">
                {items.map((it) => {
                  const r = state[it.id] || { required: 0, photos: 0, checked: false };
                  const needs = (it.photoRequired ?? false) || (r.required ?? 0) > 0;
                  const disabled = needs && r.photos < (r.required ?? 0);
                  const left = Math.max(0, (r.required ?? 0) - (r.photos ?? 0));
                  const isFull = (r.required ?? 0) > 0 && (r.photos ?? 0) >= (r.required ?? 0);

                  const taskId = r.taskId;
                  const thumbs = taskId ? sessionPhotos[taskId] || [] : [];

                  return (
                    <div key={it.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                      <label
                        className={`flex items-start gap-3 select-none ${disabled ? "opacity-70" : ""}`}
                        title={disabled ? `Upload ${left} more photo${left === 1 ? "" : "s"} to unlock` : "Mark complete"}
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
                            {disabled && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                          </div>

                          {needs && (
                            <div className="text-xs mt-0.5">
                              <span className={left > 0 ? "text-amber-600" : "text-muted-foreground"}>
                                {left > 0
                                  ? `Upload ${left} more photo${left === 1 ? "" : "s"} to unlock`
                                  : `Photos required: ${r.photos}/${r.required}`}
                              </span>
                            </div>
                          )}

                          {it.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{it.description}</div>
                          )}

                          {/* Session thumbnails */}
                          {thumbs.length > 0 && (
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {thumbs.map((u, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setPreview({ templateId: it.id, url: u, readOnly: true })}
                                  className="w-12 h-12 rounded overflow-hidden border"
                                  title="View photo"
                                >
                                  <img src={u} className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>

                      {/* Photo input & button */}
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => (fileInputs.current[it.id] = el)}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            // IMPORTANT: capture the element BEFORE any await
                            const inputEl = e.currentTarget;
                            const files = Array.from(inputEl.files || []);
                            if (files.length === 0) return;

                            // Ensure task exists before first upload
                            let rt = state[it.id];
                            if (!rt?.taskId) {
                              try {
                                const created = await ensureTask.mutateAsync({ templateId: it.id });
                                setState((s) => ({
                                  ...s,
                                  [it.id]: {
                                    ...(s[it.id] || {
                                      required: created.photoCount ?? 0,
                                      photos: 0,
                                      checked: false,
                                    }),
                                    taskId: created.id,
                                  },
                                }));
                                rt = { ...(state[it.id] || {}), taskId: created.id } as any;
                              } catch {
                                // safely clear input even if we failed to create task
                                inputEl.value = "";
                                return;
                              }
                            }

                            // Upload sequentially, respecting remaining cap
                            for (const f of files) {
                              const cur = state[it.id] || { required: 0, photos: 0 };
                              const remaining = Math.max(0, (cur.required ?? 0) - (cur.photos ?? 0));
                              if ((cur.required ?? 0) > 0 && remaining <= 0) break;
                              await uploadPhoto.mutateAsync({ taskId: Number(rt!.taskId), file: f });
                            }

                            // SAFE CLEAR: use stored element (not e.currentTarget after awaits)
                            inputEl.value = "";
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (isFull) {
                              toast({
                                title: "Upload limit reached",
                                description: `This task already has ${r.photos}/${r.required} photos.`,
                                variant: "destructive",
                              });
                              return;
                            }
                            if (isAdmin && !selectedStoreId) {
                              toast({ title: "Choose a store", description: "Pick a store before uploading photos." });
                              return;
                            }
                            openFile(it.id);
                          }}
                          disabled={uploadPhoto.isPending || ensureTask.isPending || (isAdmin && !selectedStoreId) || isFull}
                          title={isFull ? "Upload limit reached" : "Add photo(s)"}
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
          );
        })}
      </div>

      {/* Spacer so fixed footer never covers content (extra safety on very short pages) */}
      <div className="h-6" aria-hidden="true" />

      {/* Sticky footer */}
      <div className="fixed bottom-3 left-0 right-0 px-3 pointer-events-none">
        <div className="mx-auto max-w-5xl bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border rounded-xl p-3 shadow pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">
                Progress {totals.done}/{totals.total}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${canComplete ? "bg-emerald-600" : "bg-primary"}`}
                  style={{ width: `${(totals.done / Math.max(1, totals.total)) * 100}%` }}
                />
              </div>
            </div>
            <Button size="sm" className="whitespace-nowrap" disabled={!canComplete} onClick={handleCompleteRun}>
              <Check className="w-4 h-4 mr-2" />
              Complete Run
            </Button>
          </div>
        </div>
      </div>

      {/* Preview / Lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow max-w-md w-full p-4">
            <div className="font-medium mb-2">{preview.readOnly ? "Photo" : "Preview"}</div>
            <img src={preview.url} alt="preview" className="w-full rounded border" />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="outline"
                onClick={() => {
                  try { URL.revokeObjectURL(preview.url); } catch {}
                  setPreview(null);
                }}
              >
                {preview.readOnly ? "Close" : "Retake"}
              </Button>
              {!preview.readOnly && (
                <Button onClick={confirmUploadFromPreview} disabled={uploadPhoto.isPending}>
                  {uploadPhoto.isPending ? "Uploading..." : "Upload"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
