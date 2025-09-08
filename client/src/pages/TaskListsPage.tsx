import React, { useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type TemplateItem = {
  id: number;
  title: string;
  description?: string | null;
  photoRequired?: boolean;
  photoCount?: number | null;
};
type TemplateSection = { title: string; items: TemplateItem[] };

const LISTS_URL = "/tasklists";

export default function TaskListRunPage() {
  const [, params] = useRoute("/tasklists/run/:id");
  const listId = Number(params?.id);
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role === "master_admin" || user?.role === "admin";

  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(
    isAdmin ? null : (user?.storeId ?? null)
  );

  /* -------- list + templates -------- */
  const { data: list } = useQuery({
    queryKey: ["/api/task-lists", listId],
    enabled: Number.isFinite(listId),
    queryFn: async () => {
      const r = await fetch(`/api/task-lists/${listId}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: templates = [] as TemplateItem[] } = useQuery({
    queryKey: ["/api/task-lists", listId, "templates"],
    enabled: Number.isFinite(listId),
    queryFn: async () => {
      const r = await fetch(`/api/task-lists/${listId}/templates`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetch(`/api/stores`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const sections: TemplateSection[] = useMemo(
    () => [{ title: "TASKS", items: templates }],
    [templates]
  );

  type Runtime = {
    [templateId: number]: {
      taskId?: number;
      required: number;
      photos: number;
      checked: boolean;
    };
  };
  const initial: Runtime = useMemo(() => {
    const o: Runtime = {};
    for (const t of templates) {
      o[t.id] = {
        taskId: undefined,
        required: Math.max(0, Number(t.photoCount ?? 0)),
        photos: 0,
        checked: false,
      };
    }
    return o;
  }, [templates]);
  const [state, setState] = useState<Runtime>(initial);

  // Load today's tasks (so users can act without anyone pressing "run")
  useQuery({
    queryKey: ["/api/task-lists", listId, "today", selectedStoreId],
    enabled: Number.isFinite(listId) && !!selectedStoreId,
    queryFn: async () => {
      const r = await fetch(`/api/task-lists/${listId}/tasks?storeId=${selectedStoreId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<any[]>;
    },
    onSuccess: (tasks) => {
      const next: Runtime = { ...initial };
      for (const t of tasks || []) {
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
    },
  });

  const totals = useMemo(() => {
    const ids = Object.keys(state);
    const done = ids.filter((k) => state[Number(k)]?.checked).length;
    return { total: ids.length, done };
  }, [state]);

  const canComplete = totals.total > 0 &&
    totals.done === totals.total &&
    Object.values(state).every((t) => t.photos >= t.required);

  // idempotent "ensure run" (creates today's tasks if missing)
  const ensureRun = useMutation({
    mutationFn: async () => {
      const sid = selectedStoreId ?? user?.storeId ?? undefined;
      const url = sid != null ? `/api/task-lists/${listId}/run?storeId=${sid}` : `/api/task-lists/${listId}/run`;
      const r = await fetch(url, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ created: number; tasks: any[] }>;
    },
    onSuccess: (out) => {
      const next: Runtime = { ...initial };
      for (const t of out.tasks || []) {
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
      // also refresh “today”
      qc.invalidateQueries({ queryKey: ["/api/task-lists", listId, "today", selectedStoreId] });
    },
    onError: (e: any) => {
      toast({ title: "Could not prepare tasks", description: String(e?.message || e), variant: "destructive" });
    },
  });

  const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  const uploadPhoto = useMutation({
    mutationFn: async (vars: { taskId: number; file: File }) => {
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
      return r.json();
    },
    onSuccess: (_out, { taskId }) => {
      setState((s) => {
        const next: Runtime = { ...s };
        for (const key of Object.keys(next)) {
          const t = next[Number(key)];
          if (t.taskId === taskId) t.photos = (t.photos ?? 0) + 1;
        }
        return next;
      });
    },
    onError: (e: any) => {
      toast({ title: "Upload failed", description: String(e?.message || e), variant: "destructive" });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: number) => {
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
        const next: Runtime = { ...s };
        for (const key of Object.keys(next)) {
          const t = next[Number(key)];
          if (t.taskId === taskId) t.checked = true;
        }
        return next;
      });
    },
    onError: (e: any) => {
      toast({ title: "Could not complete task", description: String(e?.message || e), variant: "destructive" });
    },
  });

  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const openFile = (templateId: number) => fileInputs.current[templateId]?.click();

  const onPickPhoto = async (templateId: number, file: File | null) => {
    if (!file) return;
    let rt = state[templateId];

    // If today's tasks aren’t provisioned yet, provision them now (idempotent)
    if (!rt?.taskId) {
      await ensureRun.mutateAsync();
      rt = (safestate => safestate[templateId]) (state);
      rt = state[templateId]; // refresh local
    }
    if (!rt?.taskId) {
      toast({ title: "No task ready", description: "Could not prepare today's task for this list." });
      return;
    }

    uploadPhoto.mutate({ taskId: rt.taskId, file });
  };

  const toggleCheck = (templateId: number) => {
    const t = state[templateId];
    if (!t?.taskId) return;
    if (t.required > 0 && t.photos < t.required) return;
    if (!t.checked) completeTask.mutate(t.taskId);
  };

  const safeBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation(LISTS_URL);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={safeBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{list?.name ?? "Task List"}</h2>
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
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Overall Complete (optional) */}
          <Button disabled={!canComplete} variant={canComplete ? "default" : "outline"}>
            <Check className="w-4 h-4 mr-2" />
            Complete Run
          </Button>
        </div>
      </div>

      {/* progress */}
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

      {/* sections */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <Card key={sec.title} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{sec.title}</div>
            </div>

            <div className="space-y-2">
              {sec.items.map((it) => {
                const r = state[it.id] || { required: 0, photos: 0, checked: false };
                const needs = (it.photoRequired ?? false) || (r.required ?? 0) > 0;
                const disabled = needs && r.photos < (r.required ?? 0);
                const left = Math.max(0, (r.required ?? 0) - (r.photos ?? 0));
                return (
                  <div key={it.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <label
                      className={`flex items-start gap-3 select-none ${disabled ? "opacity-70" : ""}`}
                      title={disabled ? `Upload ${left} more photo${left === 1 ? "" : "s"} to enable` : "Mark complete"}
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
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Photos required: {r.photos}/{r.required}
                          </div>
                        )}
                        {it.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">{it.description}</div>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => (fileInputs.current[it.id] = el)}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onPickPhoto(it.id, e.target.files?.[0] ?? null)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openFile(it.id)}
                        disabled={uploadPhoto.isPending || ensureRun.isPending || (isAdmin && !selectedStoreId)}
                        title={
                          isAdmin && !selectedStoreId
                            ? "Choose a store first"
                            : left > 0
                            ? `Add photo (${left} left)`
                            : "Add photo"
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
    </div>
  );
}
