import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { storeApi, userApi, taskListApi } from "@/lib/api";
import type { User } from "@/lib/api";

type SubtaskRow = {
  id: string;
  title: string;
  description?: string;
  photoRequired: boolean;
  photoCount: number;
  assigneeId?: number;   // optional per-subtask assignment
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void; // refetch parent
};

export default function CreateTaskListDialog({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "master_admin" || user?.role === "admin";
  const isManager = user?.role === "store_manager";

  const [stores, setStores] = useState<Array<{ id: number; name: string }>>([]);
  const [storeIdForUsers, setStoreIdForUsers] = useState<number | undefined>(undefined); // used only to load users list
  const [users, setUsers] = useState<User[]>([]);

  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");

  const blankRow = (): SubtaskRow => ({
    id: crypto.randomUUID(),
    title: "",
    description: "",
    photoRequired: false,
    photoCount: 1,
    assigneeId: undefined,
  });

  const [rows, setRows] = useState<SubtaskRow[]>([blankRow()]);

  // load stores (for admins to decide which store’s roster to show in assignee dropdowns)
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const s = await storeApi.getStores();
        setStores(s || []);
        if (isAdmin) {
          setStoreIdForUsers(s?.[0]?.id);
        } else if (isManager) {
          setStoreIdForUsers(user?.storeId);
        }
      } catch {
        setStores([]);
      }
    })();
  }, [open]);

  // load users for chosen store (or manager's store)
  useEffect(() => {
    (async () => {
      if (!storeIdForUsers) {
        setUsers([]);
        return;
      }
      try {
        const u = await userApi.getUsers(storeIdForUsers);
        setUsers(u || []);
      } catch {
        setUsers([]);
      }
    })();
  }, [storeIdForUsers]);

  const userLabel = (u: User) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || `User #${u.id}`;

  const canSubmit = useMemo(() => {
    if (!listName.trim()) return false;
    if (rows.length === 0) return false;
    return rows.every(r => r.title.trim().length > 0 && (!r.photoRequired || r.photoCount > 0));
  }, [listName, rows]);

  const addRow = () => setRows((r) => [...r, blankRow()]);
  const removeRow = (id: string) => setRows((r) => r.filter(x => x.id !== id));
  const patchRow = (id: string, patch: Partial<SubtaskRow>) =>
    setRows((r) => r.map(x => (x.id === id ? { ...x, ...patch } : x)));

  const handleCreate = async () => {
    try {
      if (!canSubmit) return;
      // Build the import payload (one section == this list)
      const items = rows.map((r) => ({
        title: r.title.trim(),
        description: r.description?.trim() || undefined,
        photoRequired: !!r.photoRequired,
        photoCount: Math.max( r.photoRequired ? 1 : 0, r.photoRequired ? r.photoCount : 0 ),
        assigneeId: r.assigneeId ?? undefined, // per-item assignment (server supports override)
      }));

      await taskListApi.importOneList({
        title: listName.trim(),
        description: description.trim() || undefined,
        items,
        // For compatibility, we also send top-level defaults (not used if item has its own values)
        defaultPhotoRequired: false,
        defaultPhotoCount: 1,
      });

      toast({ title: "Task list created" });
      onCreated?.();
      onClose();
      // reset for next open
      setListName("");
      setDescription("");
      setRows([blankRow()]);
    } catch (err: any) {
      toast({ title: "Failed to create task list", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Task List</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>List Name *</Label>
            <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g., Deep Cleaning" />
          </div>

          <div>
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this list for?" />
          </div>

          {isAdmin && (
            <div>
              <Label>Show employees from store (for assignee dropdowns)</Label>
              <Select
                value={storeIdForUsers ? String(storeIdForUsers) : ""}
                onValueChange={(v) => setStoreIdForUsers(Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores.map(s => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subtasks table */}
          <div className="rounded-lg border p-3">
            <div className="text-sm font-medium mb-2">Subtasks</div>

            <div className="space-y-3">
              {rows.map((r, idx) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Label className="sr-only">Title</Label>
                    <Input
                      value={r.title}
                      onChange={(e) => patchRow(r.id, { title: e.target.value })}
                      placeholder={`Subtask #${idx + 1} title`}
                    />
                  </div>

                  <div className="col-span-3">
                    <Label className="sr-only">Description</Label>
                    <Input
                      value={r.description}
                      onChange={(e) => patchRow(r.id, { description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      id={`req-${r.id}`}
                      type="checkbox"
                      checked={r.photoRequired}
                      onChange={(e) => patchRow(r.id, { photoRequired: e.target.checked, photoCount: e.target.checked ? Math.max(1, r.photoCount) : 0 })}
                    />
                    <Label htmlFor={`req-${r.id}`}>Photos required</Label>
                    <Input
                      className="w-20 ml-2"
                      type="number"
                      min={r.photoRequired ? 1 : 0}
                      max={10}
                      value={r.photoRequired ? r.photoCount : 0}
                      onChange={(e) => {
                        const n = Math.max(r.photoRequired ? 1 : 0, Math.min(10, Number(e.target.value) || 0));
                        patchRow(r.id, { photoCount: n });
                      }}
                      disabled={!r.photoRequired}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label className="sr-only">Assignee</Label>
                    <Select
                      value={r.assigneeId ? String(r.assigneeId) : ""}
                      onValueChange={(v) => patchRow(r.id, { assigneeId: v ? Number(v) : undefined })}
                    >
                      <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All employees</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {userLabel(u)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <Button variant="ghost" onClick={() => removeRow(r.id)} disabled={rows.length === 1}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Button variant="outline" onClick={addRow}>+ Add subtask</Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canSubmit}>Create List</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
