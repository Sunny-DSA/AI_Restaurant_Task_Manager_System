import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { taskApi, userApi, storeApi } from "@/lib/api";
import type { User } from "@/types"; 


type Priority = "low" | "medium" | "high";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void; // call this to refetch
};

export default function CreateTaskDialog({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [storeId, setStoreId] = useState<number | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState<number | undefined>(undefined);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [photoCount, setPhotoCount] = useState<number>(1);
  const [recurrence, setRecurrence] = useState<{
    frequency: "daily" | "weekly" | "monthly";
    interval?: number;
    count?: number;
  } | undefined>(undefined);

  const [stores, setStores] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // load stores on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const s = await storeApi.getStores();
        setStores(s);
      } catch (e) {
        // ignore
      }
    })();
  }, [open]);

  // load users for selected store
  useEffect(() => {
    (async () => {
      if (!storeId) { setUsers([]); return; }
      try {
        const u = await userApi.getUsers(storeId);
        setUsers(u);
      } catch {
        setUsers([]);
      }
    })();
  }, [storeId]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStoreId(undefined);
    setAssigneeId(undefined);
    setPhotoRequired(false);
    setPhotoCount(1);
    setRecurrence(undefined);
  };

  const handleCreate = async () => {
    try {
      if (!title.trim()) {
        toast({ title: "Missing title", description: "Please enter a task title.", variant: "destructive" });
        return;
      }
      if (!storeId) {
        toast({ title: "Select store", description: "Please pick a store.", variant: "destructive" });
        return;
      }

      setLoading(true);
      await taskApi.createTask({
        title,
        description,
        priority, // typed union
        storeId,
        assigneeId,
        photoRequired,
        photoCount: photoRequired ? photoCount : undefined,
        recurrence,
      });

      toast({ title: "Task created" });
      onCreated?.();    // let parent refetch
      resetForm();
      onClose();
    } catch (err: any) {
      toast({
        title: "Failed to create task",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Store</Label>
              <Select
                value={storeId ? String(storeId) : ""}
                onValueChange={(v) => setStoreId(v ? Number(v) : undefined)}
              >
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Assignee (optional)</Label>
            <Select
              value={assigneeId ? String(assigneeId) : ""}
              onValueChange={(v) => setAssigneeId(v ? Number(v) : undefined)}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="photoRequired"
              type="checkbox"
              checked={photoRequired}
              onChange={(e) => setPhotoRequired(e.target.checked)}
            />
            <Label htmlFor="photoRequired">Photo required</Label>
            {photoRequired && (
              <Input
                className="ml-3 w-24"
                type="number"
                min={1}
                max={10}
                value={photoCount}
                onChange={(e) => setPhotoCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
            )}
          </div>

          {/* Recurrence (optional) – keep it simple */}
          {/* You can remove this block if you don't need recurrence in UI yet */}

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="default" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
