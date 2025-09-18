// client/src/pages/TaskLists.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Plus,
  List,
  Repeat,
  Users,
  Edit,
  Trash2,
  Copy,
  Upload,
  Store,
  ChevronRight,
  Camera,
  ChevronDown,
} from "lucide-react";

// keep your existing create flow (separate file)
import CreateTaskDialog from "@/components/CreateTaskDialog";

/* ---------------- helpers ---------------- */
const getRecurrenceLabel = (type?: string) => {
  switch ((type || "none").toLowerCase()) {
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
  switch ((type || "").toLowerCase()) {
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
const getDueLabel = (recurrence?: string): string => {
  const r = (recurrence || "none").toLowerCase();
  if (r === "daily") return "Due today";
  if (r === "weekly") return "This week";
  if (r === "monthly") return "This month";
  return "Ad-hoc";
};

type ParsedImport = {
  assigneeType: "store_wide" | "manager" | "specific_employee";
  assigneeId?: number | null;
  recurrenceType: "none" | "daily" | "weekly" | "monthly";
  recurrencePattern?: string | null;
  sections: { title: string; items: { title: string; description?: string | null; priority?: "low" | "medium" | "high"; photoRequired?: boolean; photoCount?: number }[] }[];
};

type Progress = { total: number; done: number };

/* ---------- tiny utilities ---------- */
function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: "150px", threshold: 0.01, ...(options || {}) }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options]);
  return { ref, inView } as const;
}
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded bg-muted w-full overflow-hidden">
      <div
        className={`h-full rounded transition-all ${value >= 100 ? "bg-emerald-600" : value > 0 ? "bg-blue-600" : "bg-gray-400"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* =========================================================
   Page
========================================================= */
export default function TaskLists() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = user?.role === "master_admin" || user?.role === "admin";
  const canCreate = hasPermission(user?.role || "", "create", "task_lists");
  const canUpdate = hasPermission(user?.role || "", "update", "task_lists");
  const canDelete = hasPermission(user?.role || "", "delete", "task_lists");

  // toolbar
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "due" | "upcoming" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"alpha" | "progress" | "recent">("alpha");
  const [storeFilter, setStoreFilter] = useState<string>("all");

  // dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);

  // data
  const { data: taskLists = [] } = useQuery({
    queryKey: ["/api/task-lists"],
    queryFn: async () => {
      const r = await fetch("/api/task-lists", { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetch("/api/stores", { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // mutations
  const updateListMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/task-lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Task list updated" });
      qc.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setEditingList(null);
    },
    onError: (e: any) =>
      toast({
        title: "Failed to update task list",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const duplicateListMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/task-lists/${id}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
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
      const r = await fetch(`/api/task-lists/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
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

  // filter/sort
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = [...taskLists];

    if (q) {
      out = out.filter(
        (l: any) =>
          l.name?.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q)
      );
    }
    if (isAdmin && storeFilter !== "all") {
      out = out.filter((l: any) => String(l.storeId ?? "") === storeFilter);
    }
    if (statusFilter !== "all") {
      out = out.filter((l: any) => {
        const lab = getDueLabel(l.recurrenceType);
        if (statusFilter === "due") return lab === "Due today";
        if (statusFilter === "upcoming")
          return lab === "This week" || lab === "This month";
        if (statusFilter === "inactive") return lab === "Ad-hoc";
        return true;
      });
    }
    if (sortBy === "alpha") {
      out.sort((a: any, b: any) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
    }
    return out;
  }, [taskLists, search, isAdmin, storeFilter, statusFilter, sortBy]);

  const confirmDelete = (name?: string) =>
    window.confirm(`Delete "${name ?? "this list"}"? This cannot be undone.`);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Task Lists</h1>
          <p className="text-muted-foreground">
            Click a list to open its subtasks in a full page.
          </p>
        </div>

        {isAdmin && canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New
                <ChevronDown className="w-4 h-4 ml-1 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Task List
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowImport(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* toolbar */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative col-span-1 md:col-span-2">
            <List className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              className="pl-10"
              placeholder="Search task lists…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as "all" | "due" | "upcoming" | "inactive")
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="due">Due today</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="inactive">Ad-hoc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(v) =>
                setSortBy(v as "alpha" | "progress" | "recent")
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alpha">A → Z</SelectItem>
                <SelectItem value="progress">Progress</SelectItem>
                <SelectItem value="recent">Recently edited</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <div>
              <Label className="text-xs">Store</Label>
              <Select
                value={storeFilter}
                onValueChange={(v) => setStoreFilter(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((list: any) => (
          <TaskListCard
            key={list.id}
            list={list}
            isAdmin={isAdmin}
            canUpdate={canUpdate}
            canDelete={canDelete}
            storeId={
              isAdmin
                ? (storeFilter !== "all" ? Number(storeFilter) : undefined)
                : (user?.storeId ?? undefined)
            }
            onOpen={() => setLocation(`/tasklists/run/${list.id}`)}
            onEdit={() => setEditingList(list)}
            onDuplicate={() => duplicateListMutation.mutate(list.id)}
            onDelete={() => {
              if (!confirmDelete(list.name)) return;
              deleteListMutation.mutate(list.id);
            }}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <List className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No task lists match your filters</div>
            <div className="text-sm text-muted-foreground">
              Try clearing filters or search.
            </div>
          </CardContent>
        </Card>
      )}

      {/* edit (admins only) */}
      {editingList && (
        <EditTaskListDialog
          isOpen={!!editingList}
          onClose={() => setEditingList(null)}
          existingList={editingList}
          onSubmit={(data) =>
            updateListMutation.mutate({ id: editingList.id, data })
          }
          isLoading={updateListMutation.isPending}
          stores={stores}
          isAdmin={isAdmin}
        />
      )}

      {/* import */}
      {showImport && (
        <ImportDialog
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onImportSuccess={() =>
            qc.invalidateQueries({ queryKey: ["/api/task-lists"] })
          }
        />
      )}

      {/* create — your existing component */}
      <CreateTaskDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["/api/task-lists"] })}
      />
    </div>
  );
}

/* =========================================================
   Card
========================================================= */
function TaskListCard({
  list,
  isAdmin,
  canUpdate,
  canDelete,
  storeId,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  list: any;
  isAdmin: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  storeId?: number;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const due = getDueLabel(list.recurrenceType);
  const needsStore = isAdmin && storeId == null;

  const { data: progress, isFetching } = useQuery<Progress>({
    queryKey: ["list-progress", list.id, storeId ?? "none"],
    enabled: inView && !needsStore,
    queryFn: async () => {
      const qs = storeId != null ? `?storeId=${storeId}` : "";
      const r = await fetch(`/api/task-lists/${list.id}/tasks${qs}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      const tasks = (await r.json()) as any[];
      const done = tasks.filter((t) => t.status === "completed").length;
      const total = Number(list.templateCount ?? tasks.length ?? 0) || 0;
      return { done, total };
    },
    staleTime: 10_000,
  });

  const total = progress?.total ?? Number(list.templateCount ?? 0) ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / Math.max(1, total)) * 100) : 0;

  return (
    <Card
      ref={ref}
      className="hover:shadow-md transition-shadow border-t-4 border-t-transparent hover:border-t-blue-500"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">{list.name}</CardTitle>
            {list.description && (
              <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {list.description}
              </div>
            )}
          </div>

          {/* admin tools only */}
          {isAdmin && (canUpdate || canDelete) && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {canUpdate && (
                <>
                  <Button variant="ghost" size="sm" title="Duplicate" onClick={onDuplicate}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Edit" onClick={onEdit}>
                    <Edit className="w-4 h-4" />
                  </Button>
                </>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Delete"
                  className="text-red-600 hover:text-red-700"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3" onClick={onOpen}>
        {/* badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Repeat className="w-3 h-3" />
            {getRecurrenceLabel(list.recurrenceType)}
          </Badge>

          {typeof list.storeId === "number" && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Store className="w-3 h-3" />
              Store #{list.storeId}
            </Badge>
          )}

          {(list.hasPhotoItems || list.photoRequired) && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Camera className="w-3 h-3" />
              Photos
            </Badge>
          )}

          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {getAssigneeLabel(list.assigneeType)}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground">{due}</div>

        {needsStore ? (
          <div className="text-sm text-amber-600">
            Choose a store to see today’s progress.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {isFetching ? "…" : `${done}/${total}`}
              </span>
            </div>
            <ProgressBar value={pct} />
          </>
        )}

        <div className="pt-2 flex items-center justify-end text-sm text-muted-foreground">
          Open <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   Edit dialog (admins only)
========================================================= */
function EditTaskListDialog({
  isOpen,
  onClose,
  existingList,
  onSubmit,
  isLoading,
  stores,
  isAdmin,
}: {
  isOpen: boolean;
  onClose: () => void;
  existingList: any;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  stores: any[];
  isAdmin: boolean;
}) {
  const [form, setForm] = useState(() => ({
    name: existingList?.name || "",
    description: existingList?.description || "",
    assigneeType: existingList?.assigneeType || "store_wide",
    assigneeId:
      existingList?.assigneeId != null ? Number(existingList.assigneeId) : null,
    recurrenceType: existingList?.recurrenceType || "none",
    recurrencePattern: existingList?.recurrencePattern || "",
    storeId: existingList?.storeId ?? null,
  }));

  useEffect(() => {
    setForm({
      name: existingList?.name || "",
      description: existingList?.description || "",
      assigneeType: existingList?.assigneeType || "store_wide",
      assigneeId:
        existingList?.assigneeId != null ? Number(existingList.assigneeId) : null,
      recurrenceType: existingList?.recurrenceType || "none",
      recurrencePattern: existingList?.recurrencePattern || "",
      storeId: existingList?.storeId ?? null,
    });
  }, [existingList]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: form.name.trim(),
      description: form.description || null,
      assigneeType: form.assigneeType,
      assigneeId:
        form.assigneeType === "specific_employee" && form.assigneeId
          ? Number(form.assigneeId)
          : null,
      recurrenceType: form.recurrenceType,
      recurrencePattern: form.recurrencePattern || null,
    };
    if (isAdmin && form.storeId != null) payload.storeId = Number(form.storeId);
    onSubmit(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task List</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>List name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>

          {isAdmin && stores?.length > 0 && (
            <div>
              <Label>Store</Label>
              <Select
                value={form.storeId != null ? String(form.storeId) : "all"}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    storeId: v === "all" ? null : Number(v),
                  }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Default assignment</Label>
            <Select
              value={form.assigneeType}
              onValueChange={(v) =>
                setForm((p) => ({
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

          {form.assigneeType === "specific_employee" && (
            <div>
              <Label>Employee ID</Label>
              <Input
                type="number"
                min={1}
                value={form.assigneeId ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    assigneeId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="e.g. 102"
                required
              />
            </div>
          )}

          <div>
            <Label>Recurrence</Label>
            <Select
              value={form.recurrenceType}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, recurrenceType: v }))
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

          <div>
            <Label>Pattern (optional)</Label>
            <Input
              value={form.recurrencePattern || ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, recurrencePattern: e.target.value }))
              }
              placeholder="e.g. Weekdays only"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isLoading || !form.name.trim()}>
              {isLoading ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   Import dialog (quick paste)
========================================================= */
function ImportDialog({
  isOpen,
  onClose,
  onImportSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");

  const doImport = async () => {
    try {
      const payload: ParsedImport = {
        assigneeType: "store_wide",
        assigneeId: null,
        recurrenceType: "none",
        recurrencePattern: null,
        sections: [
          {
            title: "PASTE",
            items: text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((t) => ({ title: t })),
          },
        ],
      };
      const r = await fetch("/api/task-lists/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      onImportSuccess();
      onClose();
      toast({ title: "Imported" });
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: String(e?.message || e),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import (quick paste)</DialogTitle>
        </DialogHeader>

        <Label className="text-sm mb-1">One task per line</Label>
        <textarea
          className="w-full border rounded p-2 h-48"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Clean the floor\nStock napkins\nCheck fridge temp"}
        />

        <div className="flex gap-2">
          <Button onClick={doImport}>Create List</Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
