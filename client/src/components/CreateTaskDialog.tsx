      import { useState, useEffect } from "react";
      import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
      import { Button } from "@/components/ui/button";
      import { Input } from "@/components/ui/input";
      import { Select, SelectItem } from "@/components/ui/select";
      import { taskApi, storeApi, userApi, Store, User } from "@/lib/api";

      interface Props {
        open: boolean;
        onClose: () => void;
        onCreated: () => void;
      }

      type Recurrence = {
        frequency: "daily" | "weekly" | "monthly";
        interval: number;
        count: number;
      };

      export default function CreateTaskDialog({ open, onClose, onCreated }: Props) {
        const [title, setTitle] = useState("");
        const [description, setDescription] = useState("");
        const [priority, setPriority] = useState("medium");
        const [storeId, setStoreId] = useState<number | undefined>();
        const [assigneeId, setAssigneeId] = useState<number | undefined>();
        const [photoRequired, setPhotoRequired] = useState(false);
        const [photoCount, setPhotoCount] = useState(1);
        const [recurrence, setRecurrence] = useState<Recurrence | null>(null);

        const [stores, setStores] = useState<Store[]>([]);
        const [users, setUsers] = useState<User[]>([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
          storeApi.getStores().then(setStores);
        }, []);

        useEffect(() => {
          if (storeId) {
            userApi.getUsers(storeId).then(setUsers);
          } else {
            setUsers([]);
          }
        }, [storeId]);

        const handleSubmit = async () => {
          try {
            if (!title.trim()) {
              alert("Please enter a task title.");
              return;
            }
            if (!storeId) {
              alert("Please select a store.");
              return;
            }

            setLoading(true);
            await taskApi.createTask({
              title,
              description,
              priority,
              storeId,
              assigneeId,
              photoRequired,
              // don't send 0 (schema expects min 1 when provided)
              photoCount: photoRequired ? photoCount : undefined,
              recurrence: recurrence || undefined,
            });

            onCreated();
            onClose();
          } catch (err: any) {
            alert("Error creating task: " + (err?.message ?? String(err)));
          } finally {
            setLoading(false);
          }
        };

        return (
          <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Task</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <Input
                  placeholder="Task Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <Input
                  placeholder="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <Select value={priority} onValueChange={setPriority}>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </Select>

                <Select
                  value={storeId?.toString() || ""}
                  onValueChange={(v) => setStoreId(v ? Number(v) : undefined)}
                >
                  <SelectItem value="">Select Store</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </Select>

                {storeId && (
                  <Select
                    value={assigneeId?.toString() || ""}
                    onValueChange={(v) => setAssigneeId(v ? Number(v) : undefined)}
                  >
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={photoRequired}
                    onChange={(e) => setPhotoRequired(e.target.checked)}
                  />
                  <span>Photo Required</span>
                  {photoRequired && (
                    <Input
                      type="number"
                      min={1}
                      value={photoCount}
                      onChange={(e) => setPhotoCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20"
                    />
                  )}
                </div>

                {/* Recurrence Options */}
                <div>
                  <label className="block mb-1">Recurrence</label>
                  <Select
                    value={recurrence?.frequency || ""}
                    onValueChange={(v) =>
                      setRecurrence(
                        v ? { frequency: v as Recurrence["frequency"], interval: 1, count: 1 } : null
                      )
                    }
                  >
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </Select>

                  {recurrence && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm mb-1">Interval</label>
                        <Input
                          type="number"
                          min={1}
                          value={recurrence.interval ?? 1}
                          onChange={(e) =>
                            setRecurrence((r) =>
                              r ? { ...r, interval: Math.max(1, Number(e.target.value) || 1) } : null
                            )
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Every N{" "}
                          {recurrence.frequency === "monthly"
                            ? "months"
                            : recurrence.frequency === "weekly"
                            ? "weeks"
                            : "days"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm mb-1">Count</label>
                        <Input
                          type="number"
                          min={1}
                          value={recurrence.count ?? 1}
                          onChange={(e) =>
                            setRecurrence((r) =>
                              r ? { ...r, count: Math.max(1, Number(e.target.value) || 1) } : null
                            )
                          }
                        />
                        <p className="text-xs text-gray-500 mt-1">Total occurrences</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="default" disabled={loading} onClick={handleSubmit}>
                  {loading ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      }
