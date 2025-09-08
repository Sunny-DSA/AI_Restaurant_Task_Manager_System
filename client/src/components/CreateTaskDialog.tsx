// client/src/components/CreateTaskDialog.tsx
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle ,DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { storeApi, userApi } from "@/lib/api";
import type { User, Store } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2 } from "lucide-react";

type Recurrence = "none" | "daily" | "weekly" | "monthly";

type Row = {
  id: string;
  title: string;
  description?: string;
  photoRequired: boolean;
  photoCount: number;
  assigneeId?: number;
};

export type OnCreatePayload = {
  listName: string;
  description?: string;
  storeId?: number;
  items: Array<{
    title: string;
    description?: string;
    photoRequired: boolean;
    photoCount: number;
    assigneeId?: number;
  }>;
  isAdmin: boolean;
  isManager: boolean;
  recurrence?: Recurrence;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onCreate?: (payload: OnCreatePayload) => Promise<void> | void;
};

const uid = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CreateTaskDialog({ open, onClose, onCreated, onCreate }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === "master_admin" || user?.role === "admin";
  const isManager = user?.role === "store_manager";

  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");

  const [defaultAssign, setDefaultAssign] =
    useState<"store_wide" | "specific_employee">("store_wide");
  const [defaultEmpId, setDefaultEmpId] = useState<string>("");

  const [recurrence, setRecurrence] = useState<Recurrence>("none");

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | undefined>(undefined);
  const [selectedStore, setSelectedStore] = useState<Store | undefined>(undefined);

  const [users, setUsers] = useState<User[]>([]);

  const [rows, setRows] = useState<Row[]>([
    { id: uid(), title: "", description: "", photoRequired: false, photoCount: 1, assigneeId: undefined },
  ]);

  const [saving, setSaving] = useState(false);

  const userLabel = (u: User) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || `User #${u.id}`;

  // Load stores on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const s = await storeApi.getStores();
        setStores(s || []);
        if (!isAdmin) {
          const targetId = user?.storeId ? Number(user.storeId) : s?.[0]?.id;
          if (targetId) {
            setStoreId(targetId);
            setSelectedStore(s.find((x) => x.id === targetId));
          }
        }
      } catch {
        setStores([]);
      }
    })();
  }, [open, isAdmin, user?.storeId]);

  useEffect(() => {
    if (!storeId) {
      setSelectedStore(undefined);
      return;
    }
    setSelectedStore(stores.find((s) => s.id === storeId));
  }, [storeId, stores]);

  useEffect(() => {
    (async () => {
      if (!storeId) {
        setUsers([]);
        return;
      }
      try {
        const u = await userApi.getUsers(storeId);
        setUsers(u || []);
      } catch {
        setUsers([]);
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!open) return;
    setListName("");
    setDescription("");
    setDefaultAssign("store_wide");
    setDefaultEmpId("");
    setRecurrence("none");
    setRows([{ id: uid(), title: "", description: "", photoRequired: false, photoCount: 1 }]);
  }, [open]);

  const valid = useMemo(() => {
    if (!listName.trim()) return false;
    const hasOne = rows.some((r) => r.title.trim());
    const haveStore = isAdmin ? !!storeId : true;
    return hasOne && haveStore;
  }, [listName, rows, storeId, isAdmin]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      { id: uid(), title: "", description: "", photoRequired: false, photoCount: 1, assigneeId: undefined },
    ]);

  const removeRow = (id: string) => setRows((r) => r.filter((x) => x.id !== id));

  // ---- Save (import with graceful fallback) ----
  // ---- Save (fixed: no duplicate creation) ----
  const handleSave = async () => {
    console.log("handleSave called", { valid, rows, listName, storeId, defaultAssign, defaultEmpId });

    try {
      if (!valid) {
        toast({
          title: "Missing info",
          description: "Give the list a name, add at least one subtask, and pick a store.",
          variant: "destructive",
        });
        return;
      }

      // Map default employee id to a user id (if provided)
      let defaultAssigneeId: number | undefined = undefined;
      if (defaultAssign === "specific_employee" && defaultEmpId.trim() && users.length > 0) {
        const byId = users.find(
          (u) =>
            String(u.id) === defaultEmpId.trim() ||
            String((u as any).employeeId ?? "") === defaultEmpId.trim()
        );
        if (byId) defaultAssigneeId = byId.id;
      }

      const cleanItems = rows
        .filter((r) => r.title.trim())
        .map((r) => ({
          title: r.title.trim(),
          description: r.description?.trim() || undefined,
          photoRequired: !!r.photoRequired,
          photoCount: r.photoRequired ? Math.max(1, Math.min(10, r.photoCount || 1)) : 0,
          assigneeId: r.assigneeId ?? defaultAssigneeId ?? undefined,
        }));

      console.log("Clean items prepared:", cleanItems);

      if (cleanItems.length === 0) {
        toast({
          title: "No subtasks",
          description: "Add at least one subtask.",
          variant: "destructive",
        });
        return;
      }

      setSaving(true);

      const chosenStoreId =
        (isAdmin ? storeId : user?.storeId ? Number(user.storeId) : storeId) || undefined;

      // Call /import route
      console.log("Calling /import route with storeId:", chosenStoreId);

      const importRes = await fetch("/api/task-lists/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeType: defaultAssigneeId ? "specific_employee" : "store_wide",
          assigneeId: defaultAssigneeId,
          recurrenceType: recurrence === "none" ? "none" : recurrence,
          sections: [{ title: listName.trim(), items: cleanItems }],
          description: description.trim() || undefined,
        }),
      });

      const importBody = await importRes.json();
      console.log("Import response status:", importRes.status, "body:", importBody);

      if (!importRes.ok) {
        throw new Error(`IMPORT_HTTP_${importRes.status}: ${JSON.stringify(importBody)}`);
      }

      const createdLists = (importBody?.lists || []) as Array<{ id: number }>;

      // Create templates for each subtask, handle duplicates gracefully
      for (const list of createdLists) {
        console.log(`Creating templates for listId ${list.id}`);
        for (const item of cleanItems) {
          try {
            const templateRes = await fetch(`/api/task-lists/${list.id}/templates`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: item.title,
                description: item.description,
                storeId: chosenStoreId,
                assigneeType: item.assigneeId ? "specific_employee" : "store_wide",
                assigneeId: item.assigneeId ?? null,
                photoRequired: item.photoRequired,
                photoCount: item.photoCount,
              }),
            });

            if (templateRes.status === 201) {
              const templateCreated = await templateRes.json();
              console.log("Template created:", templateCreated);
            } else if (templateRes.status === 409) {
              console.log(`Template "${item.title}" already exists, skipping creation.`);
            } else {
              const errMsg = await templateRes.text();
              throw new Error(`Template creation failed: ${errMsg}`);
            }
          } catch (e: any) {
            console.error(`Error creating template "${item.title}":`, e);
            toast({
              title: "Failed to create template",
              description: e.message || "Unknown error",
              variant: "destructive",
            });
          }
        }
      }

      toast({ title: "Task list created" });
      onCreated?.();
      onClose();
    } catch (err: any) {
      console.error("Error caught in handleSave:", err);
      toast({
        title: "Failed to create list",
        description: String(err?.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      console.log("handleSave finished, saving state reset");
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="
          w-[calc(100vw-1rem)] sm:w-auto
          max-w-3xl
          max-h-[90svh] sm:max-h-[85vh]
          overflow-y-auto overscroll-contain
        "
      >
        <DialogHeader>
          <DialogTitle>Create New Task List</DialogTitle>
          <DialogDescription>
            Fill out the form below to create a new task list for your store or team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* List title + recurrence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>List Name *</Label>
              <Input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder='e.g., "Opening Checklist", "Closing Procedures"'
              />
            </div>
            <div>
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                <SelectTrigger>
                  <SelectValue placeholder="One-time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this task list is for"
            />
          </div>

          {/* Store selection + geofence hint */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Select Store</Label>
              <Select
                value={storeId ? String(storeId) : ""}
                onValueChange={(v) => setStoreId(v ? Number(v) : undefined)}
              >
                <SelectTrigger disabled={!isAdmin}>
                  <SelectValue placeholder={isAdmin ? "Choose a store" : "Your store"} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStore && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Geofence will be enforced for <span className="font-medium">{selectedStore.name}</span>
                  {selectedStore.latitude && selectedStore.longitude && (
                    <> – lat: {selectedStore.latitude}, lng: {selectedStore.longitude}, radius: {selectedStore.geofenceRadius ?? 0}m</>
                  )}
                </div>
              )}
            </div>

            {/* Default assignment (optional) */}
            <div>
              <Label>Default Assignment</Label>
              <Select
                value={defaultAssign}
                onValueChange={(v) => setDefaultAssign(v as "store_wide" | "specific_employee")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store_wide">All employees</SelectItem>
                  <SelectItem value="specific_employee">Specific employee</SelectItem>
                </SelectContent>
              </Select>

              {defaultAssign === "specific_employee" && (
                <div className="mt-2">
                  <Label>Employee ID</Label>
                  <Input
                    value={defaultEmpId}
                    onChange={(e) => setDefaultEmpId(e.target.value)}
                    placeholder="e.g., 0000"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Enter the employee’s ID (or user id). You can override this per subtask below.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subtasks builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Subtasks</Label>
              <Button type="button" variant="outline" onClick={addRow}>
                <Plus className="w-4 h-4 mr-2" />
                Add subtask
              </Button>
            </div>

            <div className="space-y-2">
              {rows.map((r, idx) => (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="md:col-span-2">
                      <Label>Subtask Name</Label>
                      <Input
                        value={r.title}
                        onChange={(e) =>
                          setRows((x) => x.map((y) => (y.id === r.id ? { ...y, title: e.target.value } : y)))
                        }
                        placeholder={`Subtask ${idx + 1}`}
                      />
                    </div>

                    <div>
                      <Label>Photo required</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`pr-${r.id}`}
                          type="checkbox"
                          checked={r.photoRequired}
                          onChange={(e) =>
                            setRows((x) => x.map((y) => (y.id === r.id ? { ...y, photoRequired: e.target.checked } : y)))
                          }
                        />
                        <Label htmlFor={`pr-${r.id}`} className="!m-0">Require photo(s)</Label>
                      </div>
                    </div>

                    <div>
                      <Label>Photo upload limit</Label>
                      <Input
                        className="w-full"
                        type="number"
                        min={r.photoRequired ? 1 : 0}
                        max={10}
                        value={r.photoCount}
                        onChange={(e) =>
                          setRows((x) =>
                            x.map((y) =>
                              y.id === r.id
                                ? {
                                    ...y,
                                    photoCount: Math.max(
                                      r.photoRequired ? 1 : 0,
                                      Math.min(10, Number(e.target.value) || 0)
                                    ),
                                  }
                                : y
                            )
                          )
                        }
                        disabled={!r.photoRequired}
                      />
                    </div>

                    <div>
                      <Label>Assignee (optional)</Label>
                      <Select
                        value={r.assigneeId != null ? String(r.assigneeId) : "__default"}
                        onValueChange={(v) =>
                          setRows((x) =>
                            x.map((y) =>
                              y.id === r.id
                                ? { ...y, assigneeId: v === "__default" ? undefined : Number(v) }
                                : y
                            )
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default">Use default</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {userLabel(u)} (#{u.id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-2">
                    <Label>Description (optional)</Label>
                    <Input
                      value={r.description || ""}
                      onChange={(e) =>
                        setRows((x) => x.map((y) => (y.id === r.id ? { ...y, description: e.target.value } : y)))
                      }
                      placeholder="Notes or instructions"
                    />
                  </div>

                  {rows.length > 1 && (
                    <div className="flex justify-end mt-2">
                      <Button type="button" variant="ghost" onClick={() => removeRow(r.id)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !valid}>
              {saving ? "Creating..." : "Create List"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
