// @client/src/components/TaskDetailsDialog.tsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { taskApi, Task, userApi, User } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  currentUserRole: string;
  onUpdated: () => void;
}

export default function TaskDetailsDialog({
  open,
  onClose,
  task,
  currentUserRole,
  onUpdated,
}: Props) {
  const [status, setStatus] = useState(task?.status || "");
  const [notes, setNotes] = useState(task?.notes || "");
  // keep Select state as string (UI), convert to number when saving
  const [assigneeId, setAssigneeId] = useState<string | undefined>(
    task?.assigneeId != null ? String(task.assigneeId) : undefined
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (task?.storeId) {
        const list = await userApi.getUsers(task.storeId);
        if (!cancelled) setUsers(list);
      }
      if (task) {
        setStatus(task.status);
        setNotes(task.notes || "");
        setAssigneeId(task.assigneeId != null ? String(task.assigneeId) : undefined);
      }
    })();

    return () => { cancelled = true; };
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    try {
      setLoading(true);

      // Admin/Manager can force status to completed
      if (status === "completed" && hasPermission(currentUserRole, "update", "tasks")) {
        await taskApi.completeTask(task.id, {
          notes,
          forceComplete: true,
          overridePhotoRequirement: true,
        });
      } else {
        await taskApi.updateTask(task.id, {
          status,
          notes,
          assigneeId: assigneeId ? Number(assigneeId) : undefined,
        });
      }

      onUpdated();
      onClose();
    } catch (err: any) {
      alert("Error updating task: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Task Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p><strong>Title:</strong> {task.title}</p>
          <p><strong>Description:</strong> {task.description || "-"}</p>
          <p><strong>Priority:</strong> {task.priority}</p>
          <p><strong>Status:</strong> {task.status}</p>
          <p><strong>Store:</strong> {task.storeId}</p>
          <p><strong>Created:</strong> {new Date(task.createdAt).toLocaleString()}</p>

          {/* Editable for Admin/Manager */}
          {hasPermission(currentUserRole, "update", "tasks") && (
            <>
              {/* Status */}
              <Select value={status} onValueChange={setStatus}>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </Select>

              {/* Assignee */}
              <Select
                value={assigneeId ?? ""}                  // string for the UI
                onValueChange={(v) => setAssigneeId(v || undefined)}
              >
                <SelectItem value="">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.firstName} {u.lastName}
                  </SelectItem>
                ))}
              </Select>

              <Input
                placeholder="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {hasPermission(currentUserRole, "update", "tasks") && (
            <Button onClick={handleSave} disabled={loading}>Save</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
