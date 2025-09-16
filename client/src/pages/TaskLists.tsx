import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Plus, List, Repeat, Users, Edit, Trash2, Copy, Upload } from "lucide-react";

/* === ADDED: external Create modal (your createtaskdialog.tsx) === */
import CreateTaskListDialogModal from "@/components/CreateTaskDialog";

/* ---------------- helpers ---------------- */
const getRecurrenceLabel = (type?: string) => {
  switch (type) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "One-time";
  }
};
const getAssigneeLabel = (type?: string) => {
  switch (type) {
    case "store_wide":
      return "All employees";
    case "manager":
      return "Managers only";
    case "specific_employee":
      return "Specific employee";
    default:
      return "Unassigned";
  }
};

/* =========================================================
   Page
========================================================= */
export default function TaskLists() {

  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const canCreate = hasPermission(user?.role || "", "create", "task_lists");
  const canUpdate = hasPermission(user?.role || "", "update", "task_lists");
  const canDelete = hasPermission(user?.role || "", "delete", "task_lists");

  

  /* ---------- data ---------- */
  const { data: taskLists = [] } = useQuery({
    queryKey: ["/api/task-lists"],
    queryFn: async () => {
      const res = await fetch("/api/task-lists", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled:
      (user?.role === "master_admin" || user?.role === "admin") && canCreate,
    queryFn: async () => {
      const res = await fetch("/api/stores", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  /* ---------- mutations (original) ---------- */
  const createListMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/task-lists", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task list created successfully" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setShowCreateDialog(false);
    },
    onError: (e: any) =>
      toast({
        title: "Failed to create task list",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const updateListMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/task-lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task list updated" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setEditingList(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update task list",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Import (tries server endpoint; falls back to local multi-create)
  const importListsMutation = useMutation({
    mutationFn: async (payload: ParsedImport) => {
      try {
        const res = await fetch("/api/task-lists/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) return res.json();
        if (res.status !== 404) throw new Error(await res.text());
      } catch {
        /* fall back */
      }
      for (const s of payload.sections) {
        const res = await fetch("/api/task-lists", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: s.title,
            description: (s.items || []).map((i) => i.title).join(" • "),
            assigneeType: payload.assigneeType,
            assigneeId: payload.assigneeId ?? null,
            recurrenceType: payload.recurrenceType,
            recurrencePattern: payload.recurrencePattern ?? null,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      return { ok: true };
    },
    onSuccess: () => {
      toast({ title: "Task list imported" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setShowImportDialog(false);
    },
    onError: (e: any) =>
      toast({
        title: "Import failed",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const duplicateListMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/task-lists/${id}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task list duplicated" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to duplicate task list",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/task-lists/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task list deleted" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to delete task list",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const confirmDelete = (name?: string) =>
    window.confirm(`Delete "${name ?? "this list"}"? This cannot be undone.`);

  /* === ADDED: parent-delegated create for external modal === */
  const createFromModal = async (data: {
    listName: string;
    description?: string;
    storeId?: number;
    items: Array<{ title: string; description?: string; photoRequired: boolean; photoCount: number; assigneeId?: number }>;
    isAdmin: boolean;
    isManager: boolean;
  }) => {
    try {
      // 1) create via import "sections"
      const res = await fetch("/api/task-lists/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: [{ title: data.listName, items: data.items }],
          description: data.description,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();

      // 2) bind created lists to the store (admin-picked or manager's own)
      const created: Array<{ id: number }> = payload?.lists || [];
      if ((data.isManager || !data.isAdmin) && user?.storeId) {
        for (const l of created) {
          const r = await fetch(`/api/task-lists/${l.id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: user.storeId }),
          });
          if (!r.ok) throw new Error(await r.text());
        }
      } else if (data.isAdmin && data.storeId) {
        for (const l of created) {
          const r = await fetch(`/api/task-lists/${l.id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: data.storeId }),
          });
          if (!r.ok) throw new Error(await r.text());
        }
      }

      toast({ title: "Task list created" });
      setShowCreateDialog(false);
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
    } catch (e: any) {
      toast({
        title: "Failed to create task list",
        description: String(e?.message || e),
        variant: "destructive",
      });
      throw e; // allow modal to react if it needs to
    }
  };

  /* ---------- view ---------- */
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return taskLists;
    return taskLists.filter(
      (l: any) =>
        l.name?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q)
    );
  }, [taskLists, searchTerm]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Lists</h1>
          <p className="text-gray-600">
            Click a list to open its subtasks in a full page
          </p>
        </div>

        <div className="flex gap-3">
          {canCreate && (
            <>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Task List
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </>
          )}
        </div>
      </div>

      {/* search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <List className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search task lists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((list: any) => (
          <Card
            key={list.id}
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation(`/tasklists/run/${list.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{list.name}</CardTitle>
                  {list.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {list.description}
                    </p>
                  )}
                </div>

                <div
                  className="flex space-x-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canUpdate && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateListMutation.mutate(list.id)}
                        disabled={duplicateListMutation.isPending}
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingList(list)}
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </>
                  )}

                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!confirmDelete(list.name)) return;
                        deleteListMutation.mutate(list.id);
                      }}
                      disabled={deleteListMutation.isPending}
                      className="text-red-600 hover:text-red-800"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                <Row label="Recurrence">
                  <Badge
                    variant="secondary"
                    className="flex items-center space-x-1"
                  >
                    <Repeat className="w-3 h-3" />
                    <span>{getRecurrenceLabel(list.recurrenceType)}</span>
                  </Badge>
                </Row>

                <Row label="Assigned to">
                  <Badge
                    variant="outline"
                    className="flex items-center space-x-1"
                  >
                    <Users className="w-3 h-3" />
                    <span>{getAssigneeLabel(list.assigneeType)}</span>
                  </Badge>
                </Row>

                <Row label="Templates">
                  <span className="text-sm font-medium">
                    {list.templateCount ?? 0}
                  </span>
                </Row>

                <Row label="Stores">
                  <span className="text-sm font-medium">
                    {list.storeCount ?? 0}
                  </span>
                </Row>
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="w-full text-center text-sm text-gray-500">
                  Click anywhere on the card to open
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <List className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? "No task lists found" : "No task lists yet"}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm
                ? `No task lists match "${searchTerm}"`
                : "Create your first task list to group related tasks together"}
            </p>
            {!searchTerm && canCreate && (
              <div className="flex justify-center gap-3">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Task List
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(true)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* === ADDED: External Create modal (UI-only, returns payload to parent) === */}
      <CreateTaskListDialogModal
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["/api/task-lists"] })}
        onCreate={createFromModal}
      />

      {/* === KEPT: Inline dialog for EDIT ONLY (unchanged) === */}
      {editingList && (
        <CreateTaskListDialog
          isOpen={!!editingList}
          onClose={() => setEditingList(null)}
          existingList={editingList}
          stores={stores}
          onSubmit={(data) => {
            updateListMutation.mutate({ id: editingList.id, data });
          }}
          isLoading={updateListMutation.isPending}
        />
      )}

      {/* Import dialog (unchanged) */}
      <ImportTaskListDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={(payload) => importListsMutation.mutate(payload)}
        isLoading={importListsMutation.isPending}
      />
    </div>
  );
}

/* ========== small presentational row ========== */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}:</span>
      {children}
    </div>
  );
}

/* =========================================================
   Create / Edit dialog (INLINE) — used for EDIT ONLY now
========================================================= */

type CreateTaskListDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  existingList?: any;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  stores?: any[];
};

function CreateTaskListDialog({
  isOpen,
  onClose,
  existingList,
  onSubmit,
  isLoading,
  stores: _stores = [],
}: CreateTaskListDialogProps) {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: existingList?.name || "",
    description: existingList?.description || "",
    assigneeType: existingList?.assigneeType || "store_wide",
    assigneeId:
      existingList?.assigneeId != null ? Number(existingList.assigneeId) : null,
    recurrenceType: existingList?.recurrenceType || "none",
    recurrencePattern: existingList?.recurrencePattern || "",
    storeId:
      existingList?.storeId != null ? Number(existingList.storeId) : null,
  });

  React.useEffect(() => {
    setFormData({
      name: existingList?.name || "",
      description: existingList?.description || "",
      assigneeType: existingList?.assigneeType || "store_wide",
      assigneeId:
        existingList?.assigneeId != null
          ? Number(existingList.assigneeId)
          : null,
      recurrenceType: existingList?.recurrenceType || "none",
      recurrencePattern: existingList?.recurrencePattern || "",
      storeId:
        existingList?.storeId != null ? Number(existingList.storeId) : null,
    });
  }, [existingList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: formData.name.trim(),
      description: formData.description || null,
      assigneeType: formData.assigneeType,
      assigneeId:
        formData.assigneeType === "specific_employee" && formData.assigneeId
          ? Number(formData.assigneeId)
          : null,
      recurrenceType: formData.recurrenceType,
      recurrencePattern: formData.recurrencePattern || null,
    };

    // Admins can choose store; managers default to their store
    if (_stores.length > 0 && formData.storeId) {
      payload.storeId = Number(formData.storeId);
    }
    onSubmit(payload);
  };
  

  const showStoreSelect =
    _stores.length > 0 && (user?.role === "master_admin" || user?.role === "admin");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingList ? "Edit Task List" : "Create New Task List"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">List Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="e.g., Opening Checklist, Closing Procedures"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Describe what this task list is for"
              rows={3}
              className="mt-1"
            />
          </div>

          {showStoreSelect && (
            <div>
              <Label>Store</Label>
              <Select
                value={formData.storeId ? String(formData.storeId) : ""}
                onValueChange={(v) =>
                  setFormData((p) => ({ ...p, storeId: Number(v) }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose store..." />
                </SelectTrigger>
                <SelectContent>
                  {_stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Default Assignment</Label>
            <Select
              value={formData.assigneeType}
              onValueChange={(v) =>
                setFormData((p) => ({
                  ...p,
                  assigneeType: v,
                  assigneeId: v === "specific_employee" ? p.assigneeId : null,
                }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store_wide">All employees</SelectItem>
                <SelectItem value="manager">Managers only</SelectItem>
                <SelectItem value="specific_employee">
                  Specific employee
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.assigneeType === "specific_employee" && (
            <div>
              <Label htmlFor="assigneeId">Employee ID</Label>
              <Input
                id="assigneeId"
                type="number"
                min={1}
                value={formData.assigneeId ?? ""}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    assigneeId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="e.g., 0000"
                className="mt-1"
                required
              />
            </div>
          )}

          <div>
            <Label>Recurrence</Label>
            <Select
              value={formData.recurrenceType}
              onValueChange={(v) =>
                setFormData((p) => ({ ...p, recurrenceType: v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">One-time</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.recurrenceType !== "none" && (
            <div>
              <Label htmlFor="recurrencePattern">Custom Pattern (optional)</Label>
              <Input
                id="recurrencePattern"
                value={formData.recurrencePattern}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    recurrencePattern: e.target.value,
                  }))
                }
                placeholder="e.g., Weekdays only, Every 2 weeks"
                className="mt-1"
              />
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
              className="flex-1"
            >
              {isLoading
                ? "Saving..."
                : existingList
                ? "Update List"
                : "Create List"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   Import dialog (paste or CSV) — unchanged from your version
========================================================= */

type ParsedImport = {
  assigneeType: "store_wide" | "manager" | "specific_employee";
  assigneeId?: number | null;
  recurrenceType: "none" | "daily" | "weekly" | "monthly";
  recurrencePattern?: string | null;
  sections: {
    title: string;
    items: {
      title: string;
      description?: string | null;
      priority?: "low" | "medium" | "high";
      photoRequired?: boolean;
      photoCount?: number;
    }[];
  }[];
};

function ImportTaskListDialog({
  isOpen,
  onClose,
  onImport,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (payload: ParsedImport) => void;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"paste" | "csv">("paste");
  const [text, setText] = useState("");
  const [defaultPhotoRequired, setDefaultPhotoRequired] = useState(false);
  const [defaultPhotoCount, setDefaultPhotoCount] = useState(1);
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [csvName, setCsvName] = useState<string>("");

  // --- keep the rest of your existing implementation exactly as-is ---
  // (parsers + UI)
  function parseCsv(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (inQuotes) {
        if (c === '"' && csv[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") {
          row.push(field.trim());
          field = "";
        } else if (c === "\n") {
          row.push(field.trim());
          rows.push(row);
          row = [];
          field = "";
        } else if (c !== "\r") {
          field += c;
        }
      }
    }
    if (field.length || row.length) {
      row.push(field.trim());
      rows.push(row);
    }
    return rows.filter((r) => r.some((x) => x.length));
  }

  function parseCsvToPayload(csv: string): ParsedImport {
    const rows = parseCsv(csv);
    if (rows.length === 0) throw new Error("CSV is empty");
    const header = rows[0].map((h) => h.toLowerCase().trim());
    const idx = (name: string) => header.indexOf(name);
    const iSection = idx("section");
    const iTask = idx("task");
    const iDesc = idx("description");
    const iPrio = idx("priority");
    const iReq = idx("photorequired");
    const iCnt = idx("photocount");
    if (iSection < 0 || iTask < 0)
      throw new Error('CSV needs at least "Section" and "Task" columns');

    const bySection = new Map<string, { title: string; items: any[] }>();
    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const sec = cols[iSection] || "GENERAL";
      const task = cols[iTask];
      if (!task) continue;
      const itm = {
        title: task,
        description: iDesc >= 0 ? cols[iDesc] || null : null,
        priority: (iPrio >= 0 ? (cols[iPrio] || "").toLowerCase() : "normal") as any,
        photoRequired:
          iReq >= 0 ? /^(1|true|yes)$/i.test(cols[iReq] || "") : undefined,
        photoCount:
          iCnt >= 0 && cols[iCnt]
            ? Math.max(1, parseInt(cols[iCnt]!, 10))
            : undefined,
      };
      if (!bySection.has(sec))
        bySection.set(sec, { title: sec, items: [] });
      bySection.get(sec)!.items.push(itm);
    }

    return {
      assigneeType: "store_wide",
      assigneeId: null,
      recurrenceType: "none",
      recurrencePattern: null,
      sections: Array.from(bySection.values()),
    };
  }

  function parsePaste(): ParsedImport {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const sections: ParsedImport["sections"] = [];
    let current: { title: string; items: any[] } | null = null;
    for (const l of lines) {
      if (/^[A-Z0-9\s\-:&()]+$/.test(l) && !l.startsWith("-")) {
        if (current) sections.push(current);
        current = { title: l, items: [] };
      } else if (l.startsWith("-")) {
        if (!current) current = { title: "GENERAL", items: [] };
        current.items.push({ title: l.replace(/^-+/, "").trim() });
      }
    }
    if (current) sections.push(current);
    return {
      assigneeType: "store_wide",
      assigneeId: null,
      recurrenceType: "none",
      recurrencePattern: null,
      sections,
    };
  }

  const onPreview = async () => {
    try {
      const payload =
        tab === "csv"
          ? preview ??
            (() => {
              throw new Error("Choose a CSV file first");
            })()
          : parsePaste();
      (payload as any).defaultPhotoRequired = defaultPhotoRequired;
      (payload as any).defaultPhotoCount = defaultPhotoCount;
      setPreview(payload);
      toast({ title: "Preview generated" });
    } catch (e: any) {
      toast({
        title: "Could not parse",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  const handleCreate = () => {
    if (!preview) {
      onPreview();
      return;
    }
    onImport(preview);
  };

  const onCsvFile = (f?: File) => {
    if (!f) return;
    setCsvName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseCsvToPayload(String(reader.result || ""));
        (payload as any).defaultPhotoRequired = defaultPhotoRequired;
        (payload as any).defaultPhotoCount = defaultPhotoCount;
        setPreview(payload);
        toast({
          title: "CSV parsed",
          description: `${payload.sections.length} section(s)`,
        });
      } catch (err: any) {
        setPreview(null);
        toast({
          title: "CSV error",
          description: String(err?.message || err),
          variant: "destructive",
        });
      }
    };
    reader.readAsText(f);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Task List</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant={tab === "paste" ? "default" : "outline"}
            onClick={() => setTab("paste")}
          >
            Paste
          </Button>
          <Button
            variant={tab === "csv" ? "default" : "outline"}
            onClick={() => setTab("csv")}
          >
            CSV
          </Button>
        </div>

        {tab === "paste" ? (
          <div>
            <Label>
              Paste checklist text (HEADERS in ALL CAPS, items as bullets)
            </Label>
            <Textarea
              className="mt-2 min-h-[220px]"
              placeholder={`KITCHEN OPENING:\n- Turn on hood\n- Check temps\n\nLOBBY:\n- Wipe tables\n- Stock napkins`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>
              Upload CSV (columns: Section, Task, Description, Priority,
              PhotoRequired, PhotoCount)
            </Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onCsvFile(e.target.files?.[0] || undefined)}
            />
            {csvName && (
              <div className="text-sm text-muted-foreground">
                Selected: {csvName}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={defaultPhotoRequired}
              onCheckedChange={setDefaultPhotoRequired}
            />
            <span>Default photo required</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Photos per task</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={defaultPhotoCount}
              onChange={(e) =>
                setDefaultPhotoCount(
                  Math.max(1, parseInt(e.target.value || "1", 10))
                )
              }
              className="w-20"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="button" onClick={onPreview} variant="outline">
            Preview
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Importing..." : "Create List(s)"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>

        {preview && (
          <div className="border rounded-md p-3 space-y-3">
            {preview.sections.map((s, i) => (
              <div key={i}>
                <div className="font-medium">{s.title}</div>
                {s.items.map((it, j) => (
                  <div key={j} className="text-sm text-muted-foreground">
                    - {it.title}
                    {it.photoRequired ? " (photo)" : ""}
                    {it.photoCount ? ` x${it.photoCount}` : ""}
                    {it.priority ? ` [${it.priority}]` : ""}
                    {it.description ? ` — ${it.description}` : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
