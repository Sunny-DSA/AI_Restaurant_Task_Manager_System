// client/src/pages/Tasks.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskApi, storeApi, type Task } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, Search, Store as StoreIcon } from "lucide-react";

/* --------------------------------------------
   Constants / helpers
--------------------------------------------- */

const STATUS_ORDER: Array<Task["status"]> = [
  "available",
  "pending",
  "claimed",
  "in_progress",
  "completed",
  "overdue",
];

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  pending: "Pending",
  claimed: "Claimed",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
  unknown: "Unknown",
};

const priorityBadge: Record<string, string> = {
  high: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

/* --------------------------------------------
   Create Task Dialog (kept lightweight)
--------------------------------------------- */

function CreateTaskDialog({
  open,
  onClose,
  defaultStoreId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultStoreId?: number;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storeId, setStoreId] = useState<number | undefined>(defaultStoreId);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [photoRequired, setPhotoRequired] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () =>
      taskApi.createTask({
        title,
        description,
        storeId: storeId!,
        priority,
        photoRequired,
        photoCount: photoRequired ? 1 : 0,
      }),
  });

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setStoreId(defaultStoreId);
      setPriority("medium");
      setPhotoRequired(false);
    }
  }, [open, defaultStoreId]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          </div>

          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="photoReq"
              type="checkbox"
              checked={photoRequired}
              onChange={(e) => setPhotoRequired(e.target.checked)}
            />
            <Label htmlFor="photoReq">Photo required</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!storeId || !title.trim()) return;
                await createMutation.mutateAsync();
                onCreated();
                onClose();
              }}
              disabled={!title.trim() || !storeId || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------
   Task card (compact, action buttons)
--------------------------------------------- */

function TaskCard({
  t,
  onClaim,
  onComplete,
  onMakeAvailable,
  isClaiming,
  isCompleting,
  isMakingAvailable,
  canEmployeeClaim,
  canMakeAvailable,
}: {
  t: Task;
  onClaim: (id: number) => void;
  onComplete: (id: number) => void;
  onMakeAvailable: (id: number) => void;
  isClaiming: boolean;
  isCompleting: boolean;
  isMakingAvailable: boolean;
  canEmployeeClaim: boolean;
  canMakeAvailable: boolean;
}) {
  const needsPhotos = (t.photoCount ?? 0) > 0;
  const photoText =
    needsPhotos ? `${t.photosUploaded ?? 0}/${t.photoCount ?? 0}` : "0/0";

  return (
    <div className="border rounded p-3 hover:bg-muted/40 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{t.title}</div>
          {t.description && (
            <div className="text-sm text-muted-foreground truncate">{t.description}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge className={priorityBadge[String(t.priority) || "medium"]}>
              {(t.priority || "medium").toString().toUpperCase()}
            </Badge>
            {needsPhotos && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" />
                {photoText}
              </Badge>
            )}
            {t.dueAt && (
              <Badge variant="outline">Due {new Date(t.dueAt).toLocaleDateString()}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {/* employee claim */}
        {canEmployeeClaim && t.status === "available" && (
          <Button size="sm" onClick={() => onClaim(t.id)} disabled={isClaiming}>
            {isClaiming ? "..." : "Claim"}
          </Button>
        )}

        {/* complete (everyone except already completed) */}
        {t.status !== "completed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onComplete(t.id)}
            disabled={isCompleting}
            title={needsPhotos && (t.photosUploaded ?? 0) < (t.photoCount ?? 0)
              ? "Upload required photos before completing"
              : undefined}
          >
            {isCompleting ? "..." : <><Check className="w-4 h-4 mr-1" />Complete</>}
          </Button>
        )}

        {/* make available (admin/manager only) when pending */}
        {canMakeAvailable && t.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMakeAvailable(t.id)}
            disabled={isMakingAvailable}
          >
            {isMakingAvailable ? "..." : "Make Available"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------
   Page
--------------------------------------------- */

export default function Tasks() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const isAdmin = user?.role === "admin" || user?.role === "master_admin";
  const isManager = user?.role === "store_manager";
  const isEmployee = user?.role === "employee";

  // filters
  const [storeFilter, setStoreFilter] = useState<string>(
    isAdmin ? "all" : String(user?.storeId ?? "")
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);

  /* ---------- stores (for admin filter) ---------- */
  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: storeApi.getStores,
    enabled: !!user && isAdmin,
    placeholderData: [],
  });

  /* ---------- tasks ---------- */
  // EMPLOYEE: load both "my" and "available" and merge
  const { data: myTasks = [] } = useQuery({
    queryKey: ["myTasks"],
    enabled: !!user && isEmployee,
    queryFn: async () => (await taskApi.getMyTasks()) ?? [],
    placeholderData: [],
  });

  const { data: availableTasks = [] } = useQuery({
    queryKey: ["availableTasks", user?.storeId],
    enabled: !!user && isEmployee && !!user?.storeId,
    queryFn: async () => (await taskApi.getAvailableTasks(user!.storeId)) ?? [],
    placeholderData: [],
  });

  // MANAGER/ADMIN: broader fetch; client-filter later
  const { data: mgrAdminTasks = [] , refetch } = useQuery({
    queryKey: ["tasks", storeFilter, user?.role, user?.storeId],
    enabled: !!user && (isAdmin || isManager),
    queryFn: async () => {
      const storeIdNum =
        isAdmin && storeFilter !== "all"
          ? Number(storeFilter)
          : isManager
          ? user?.storeId
          : undefined;
      return (await taskApi.getTasks({ storeId: storeIdNum })) ?? [];
    },
    placeholderData: [],
  });

  // Choose raw list based on role
  const rawTasks: Task[] = useMemo(() => {
    if (isEmployee) {
      const map = new Map<number, Task>();
      for (const t of myTasks) map.set(t.id, t);
      for (const t of availableTasks) map.set(t.id, t);
      return Array.from(map.values());
    }
    return mgrAdminTasks;
  }, [isEmployee, myTasks, availableTasks, mgrAdminTasks]);

  /* ---------- mutations ---------- */
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      taskApi.updateTask(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["myTasks"] });
      qc.invalidateQueries({ queryKey: ["availableTasks"] });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (id: number) => taskApi.claimTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["myTasks"] });
      qc.invalidateQueries({ queryKey: ["availableTasks"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) =>
      taskApi.completeTask(id, { overridePhotoRequirement: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["myTasks"] });
      qc.invalidateQueries({ queryKey: ["availableTasks"] });
    },
  });

  /* ---------- derived: filtering + counts ---------- */
  const tasksAfterStore = useMemo(() => {
    if (isAdmin && storeFilter !== "all") {
      const sid = Number(storeFilter);
      return rawTasks.filter((t) => Number(t.storeId) === sid);
    }
    if (isManager) {
      return rawTasks.filter((t) => Number(t.storeId) === Number(user?.storeId));
    }
    return rawTasks;
  }, [rawTasks, isAdmin, isManager, storeFilter, user?.storeId]);

  const tasksAfterSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasksAfterStore;
    return tasksAfterStore.filter((t) => {
      const hay =
        (t.title || "") +
        " " +
        (t.description || "") +
        " " +
        (t.status || "");
      return hay.toLowerCase().includes(q);
    });
  }, [tasksAfterStore, search]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const st of STATUS_ORDER) m[st] = 0;
    for (const t of tasksAfterSearch) {
      const k = (t.status || "unknown").toLowerCase();
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [tasksAfterSearch]);

  const tasksAfterFilter = useMemo(() => {
    if (statusFilter === "all") return tasksAfterSearch;
    return tasksAfterSearch.filter((t) => (t.status || "").toLowerCase() === statusFilter);
  }, [tasksAfterSearch, statusFilter]);

  const grouped = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasksAfterFilter) {
      const k = (t.status || "unknown").toLowerCase();
      (m[k] ||= []).push(t);
    }
    return m;
  }, [tasksAfterFilter]);

  /* ---------- UI helpers ---------- */
  const canEmployeeClaim = isEmployee;
  const canMakeAvailable = isAdmin || isManager;

  /* --------------------------------------------
     Render
  --------------------------------------------- */

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        {(isAdmin || isManager) && (
          <Button onClick={() => setShowCreate(true)}>New Task</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Store filter (admins only) */}
        {isAdmin && (
          <div>
            <Label className="mb-1 block">Store</Label>
            <Select
              value={storeFilter}
              onValueChange={(v) => setStoreFilter(v)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <StoreIcon className="w-4 h-4" />
                    All Stores
                  </div>
                </SelectItem>
                {stores.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Status chips */}
        <div className="flex flex-col">
          <Label className="mb-1">Status</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "All", count: tasksAfterSearch.length },
              ...STATUS_ORDER.map((k) => ({
                key: k,
                label: STATUS_LABEL[k],
                count: statusCounts[k] || 0,
              })),
            ].map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={statusFilter === s.key ? "default" : "outline"}
                onClick={() => setStatusFilter(s.key)}
                className="h-8"
              >
                {s.label}
                <span className="ml-2 text-xs opacity-80">{s.count}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="ml-auto w-full md:w-[320px]">
          <Label className="mb-1 block">Search</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Title, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Empty state */}
      {tasksAfterFilter.length === 0 && (
        <div className="text-sm text-muted-foreground border rounded-md p-6">
          No tasks match your filters.
        </div>
      )}

      {/* Kanban (All) or Single lane */}
      {statusFilter === "all" ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STATUS_ORDER.map((st) => (
            <Card key={st}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {STATUS_LABEL[st]}
                  <Badge variant="secondary">{statusCounts[st] || 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(grouped[st] || []).map((t) => (
                  <TaskCard
                    key={t.id}
                    t={t}
                    onClaim={(id) => claimMutation.mutate(id)}
                    onComplete={(id) => completeMutation.mutate(id)}
                    onMakeAvailable={(id) =>
                      updateMutation.mutate({ id, status: "available" })
                    }
                    isClaiming={claimMutation.isPending}
                    isCompleting={completeMutation.isPending}
                    isMakingAvailable={updateMutation.isPending}
                    canEmployeeClaim={canEmployeeClaim}
                    canMakeAvailable={canMakeAvailable}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {STATUS_LABEL[statusFilter] || "Tasks"}
                <Badge variant="secondary">{tasksAfterFilter.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasksAfterFilter.map((t) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  onClaim={(id) => claimMutation.mutate(id)}
                  onComplete={(id) => completeMutation.mutate(id)}
                  onMakeAvailable={(id) =>
                    updateMutation.mutate({ id, status: "available" })
                  }
                  isClaiming={claimMutation.isPending}
                  isCompleting={completeMutation.isPending}
                  isMakingAvailable={updateMutation.isPending}
                  canEmployeeClaim={canEmployeeClaim}
                  canMakeAvailable={canMakeAvailable}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create */}
      <CreateTaskDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultStoreId={isManager ? user?.storeId : undefined}
        onCreated={() => refetch?.()}
      />
    </div>
  );
}
