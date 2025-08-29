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

export default function Tasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // stores (for managers/admins)
  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: storeApi.getStores,
    enabled: !!user,
  });

  // tasks
  const { data: tasks = [], refetch } = useQuery({
    queryKey: ["tasks", user?.storeId, statusFilter],
    queryFn: async () => {
      if (!user) return [] as Task[];
      if (user.role === "employee") {
        return taskApi.getMyTasks();
      }
      // admin/manager: allow filtering
      return taskApi.getTasks({
        storeId: user.role === "store_manager" ? user.storeId : undefined,
        status: statusFilter === "all" ? undefined : statusFilter || undefined,
      });
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      taskApi.updateTask(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const claimMutation = useMutation({
    mutationFn: async (id: number) => taskApi.claimTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => taskApi.completeTask(id, { overridePhotoRequirement: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const grouped = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasks) {
      const k = t.status || "unknown";
      (m[k] ||= []).push(t);
    }
    return m;
  }, [tasks]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        {(user?.role === "master_admin" || user?.role === "admin" || user?.role === "store_manager") && (
          <Button onClick={() => setShowCreate(true)}>New Task</Button>
        )}
      </div>

      {(user?.role === "master_admin" || user?.role === "admin") && (
        <div className="flex gap-3 items-end">
          <div>
            <Label>Status filter</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* simple grouped lists */}
      {Object.entries(grouped).length === 0 && (
        <div className="text-gray-500">No tasks found.</div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([status, list]) => (
          <Card key={status}>
            <CardHeader>
              <CardTitle className="capitalize">{status.replace("_", " ")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {list.map((t) => (
                <div key={t.id} className="border rounded p-3">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-sm text-gray-600">{t.description}</div>}

                  <div className="flex gap-2 mt-2">
                    {/* actions depend on role/status */}
                    {user?.role === "employee" && t.status === "available" && (
                      <Button size="sm" onClick={() => claimMutation.mutate(t.id)}>
                        {claimMutation.isPending ? "..." : "Claim"}
                      </Button>
                    )}

                    {(user?.role === "employee" || user?.role === "store_manager" || user?.role === "admin" || user?.role === "master_admin") &&
                      t.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeMutation.mutate(t.id)}
                        >
                          {completeMutation.isPending ? "..." : "Complete"}
                        </Button>
                      )}

                    {(user?.role === "admin" || user?.role === "master_admin" || user?.role === "store_manager") &&
                      t.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMutation.mutate({ id: t.id, status: "available" })}
                        >
                          {updateMutation.isPending ? "..." : "Make Available"}
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* create dialog */}
      <CreateTaskDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultStoreId={user?.storeId}
        onCreated={() => refetch()}
      />
    </div>
  );
}
