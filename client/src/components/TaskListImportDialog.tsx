import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { taskListApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type TemplateItem = {
  title: string;
  description?: string;
  photoRequired?: boolean;
  sortOrder?: number;
};

type TemplateRow = {
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high";
  photoRequired?: boolean;
  photoCount?: number;
  items?: TemplateItem[];
};

type Mode = "paste" | "csv";

interface TaskListImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void; // e.g., refetch lists
}

/** Very small CSV parser that supports quotes and commas */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        cur.push(field.trim());
        field = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        // consume \r\n as one newline if present
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field.trim());
        rows.push(cur);
        cur = [];
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  cur.push(field.trim());
  rows.push(cur);
  return rows.filter((r) => r.length && r.some((c) => c !== ""));
}

/** Parse a plain-text checklist into templates + items */
function parsePlainText(
  raw: string,
  defaults: { photoRequired: boolean; photoCount: number }
): TemplateRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const isHeader = (s: string) =>
    /^[A-Z0-9\s\-\(\)\.&/]+:?$/.test(s) && !/[a-z]/.test(s); // VERY simple: all-caps line (optionally ending with :)

  const isBullet = (s: string) => /^\s*(?:[-*•]|\d+[\.\)])\s+/.test(s);

  const templates: TemplateRow[] = [];
  let current: TemplateRow | null = null;
  let itemIndex = 0;

  for (const line of lines) {
    if (isHeader(line)) {
      current = {
        title: line.replace(/:$/, "").trim(),
        photoRequired: defaults.photoRequired,
        photoCount: defaults.photoCount,
        priority: "normal",
        items: [],
      };
      templates.push(current);
      itemIndex = 0;
      continue;
    }

    if (!current) {
      // First non-header becomes a template
      current = {
        title: line,
        photoRequired: defaults.photoRequired,
        photoCount: defaults.photoCount,
        priority: "normal",
        items: [],
      };
      templates.push(current);
      itemIndex = 0;
      continue;
    }

    if (isBullet(line)) {
      const title = line.replace(/^\s*(?:[-*•]|\d+[\.\)])\s+/, "");
      current.items!.push({
        title: title,
        photoRequired: defaults.photoRequired,
        sortOrder: itemIndex++,
      });
    } else {
      // Treat as extra description line for the current template
      current.description = current.description ? `${current.description}\n${line}` : line;
    }
  }

  return templates;
}

/** Convert rows (with header) into templates + items. Only requires task_title/subitem_title. */
function templatesFromCsv(csv: string, defaults: { photoRequired: boolean; photoCount: number }): TemplateRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  const iTaskTitle = idx("task_title");
  const iTaskDescription = idx("task_description");
  const iPriority = idx("priority");
  const iPhotoRequired = idx("photo_required");
  const iPhotoCount = idx("photo_count");
  const iSubTitle = idx("subitem_title");
  const iSubDesc = idx("subitem_description");

  const out: TemplateRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const taskTitle = row[iTaskTitle] || "";
    if (!taskTitle) continue;

    const tpl: TemplateRow = {
      title: taskTitle,
      description: iTaskDescription >= 0 ? row[iTaskDescription] || undefined : undefined,
      priority:
        iPriority >= 0 && row[iPriority]
          ? (row[iPriority].toLowerCase() as "low" | "normal" | "high")
          : "normal",
      photoRequired:
        iPhotoRequired >= 0 && row[iPhotoRequired]
          ? /^true|1|yes$/i.test(row[iPhotoRequired])
          : defaults.photoRequired,
      photoCount:
        iPhotoCount >= 0 && row[iPhotoCount] ? Math.max(1, Number(row[iPhotoCount]) || 1) : defaults.photoCount,
      items: [],
    };

    // allow a single subitem per row; multi-line variants can repeat the task_title
    if (iSubTitle >= 0 && row[iSubTitle]) {
      tpl.items!.push({
        title: row[iSubTitle],
        description: iSubDesc >= 0 ? row[iSubDesc] || undefined : undefined,
        photoRequired: tpl.photoRequired,
        sortOrder: 0,
      });
    }

    out.push(tpl);
  }

  return out;
}

export default function TaskListImportDialog({ open, onOpenChange, onImported }: TaskListImportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("paste");
  const [rawText, setRawText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [assigneeType, setAssigneeType] = useState<"store_wide" | "manager" | "specific_employee">("store_wide");
  const [assigneeId, setAssigneeId] = useState<number | undefined>(undefined);
  const [recurrenceType, setRecurrenceType] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrencePattern, setRecurrencePattern] = useState("");

  const [defaultPhotoRequired, setDefaultPhotoRequired] = useState(false);
  const [defaultPhotoCount, setDefaultPhotoCount] = useState(1);
  const [assignToMyStore, setAssignToMyStore] = useState(true);

  const [preview, setPreview] = useState<TemplateRow[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => !!listName && preview && preview.length > 0 && !isSubmitting,
    [listName, preview, isSubmitting]
  );

  const reset = () => {
    setMode("paste");
    setRawText("");
    setCsvFile(null);
    setPreview(null);
    setListName("");
    setListDescription("");
    setAssigneeType("store_wide");
    setAssigneeId(undefined);
    setRecurrenceType("none");
    setRecurrencePattern("");
    setDefaultPhotoRequired(false);
    setDefaultPhotoCount(1);
    setAssignToMyStore(true);
    setIsSubmitting(false);
  };

  const buildPreview = async () => {
    try {
      const defaults = {
        photoRequired: defaultPhotoRequired,
        photoCount: Math.max(1, Number(defaultPhotoCount) || 1),
      };

      if (mode === "paste") {
        const tpls = parsePlainText(rawText, defaults);
        if (!tpls.length) throw new Error("Could not detect any tasks. Please paste a checklist with headings and bullets.");
        setPreview(tpls);
        toast({ title: "Preview generated" });
      } else {
        if (!csvFile) throw new Error("Choose a CSV file first.");
        const text = await csvFile.text();
        const tpls = templatesFromCsv(text, defaults);
        if (!tpls.length) throw new Error("No rows found. Check your CSV headers (task_title, subitem_title, …).");
        setPreview(tpls);
        toast({ title: "Preview generated" });
      }
    } catch (err: any) {
      setPreview(null);
      toast({ title: "Failed to preview", description: err?.message || String(err), variant: "destructive" });
    }
  };

  const doImport = async () => {
    if (!preview || preview.length === 0) return;
    setIsSubmitting(true);
    try {
      const payload = {
        list: {
          name: listName,
          description: listDescription || undefined,
          assigneeType,
          assigneeId,
          recurrenceType: recurrenceType === "none" ? undefined : recurrenceType,
          recurrencePattern: recurrencePattern || undefined,
        },
        templates: preview,
        assignToMyStore: assignToMyStore && user?.role === "store_manager",
      };

      await taskListApi.import(payload as any);

      toast({ title: "Task list imported" });
      onOpenChange(false);
      onImported?.();
      reset();
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Please verify the data and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
     
      <DialogHeader className="sticky top-0 bg-background z-10 pb-2 border-b">
          <DialogTitle>Import Task List</DialogTitle>
          <DialogDescription>Paste from a checklist or import a CSV, then preview and create the list.</DialogDescription>
        </DialogHeader>

        {/* List meta */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="listName">List Name *</Label>
            <Input id="listName" value={listName} onChange={(e) => setListName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="assigneeType">Default Assignment</Label>
            <Select value={assigneeType} onValueChange={(v: any) => setAssigneeType(v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store_wide">All employees</SelectItem>
                <SelectItem value="manager">Managers only</SelectItem>
                <SelectItem value="specific_employee">Specific employee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {assigneeType === "specific_employee" && (
            <div>
              <Label htmlFor="assigneeId">Employee ID</Label>
              <Input
                id="assigneeId"
                type="number"
                value={assigneeId ?? ""}
                onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1"
                placeholder="e.g., 42"
              />
            </div>
          )}
          <div className="md:col-span-2">
            <Label htmlFor="listDesc">Description</Label>
            <Textarea
              id="listDesc"
              rows={2}
              value={listDescription}
              onChange={(e) => setListDescription(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Recurrence</Label>
            <Select value={recurrenceType} onValueChange={(v: any) => setRecurrenceType(v)}>
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
          {recurrenceType !== "none" && (
            <div>
              <Label htmlFor="recurrencePattern">Custom Pattern (optional)</Label>
              <Input
                id="recurrencePattern"
                value={recurrencePattern}
                onChange={(e) => setRecurrencePattern(e.target.value)}
                className="mt-1"
                placeholder="e.g., Weekdays only"
              />
            </div>
          )}
          {user?.role === "store_manager" && (
            <div className="flex items-center gap-3 mt-2">
              <Switch checked={assignToMyStore} onCheckedChange={setAssignToMyStore} />
              <span className="text-sm text-gray-700">Assign this list to my store</span>
            </div>
          )}
        </div>

        {/* Mode switch */}
        <div className="flex gap-2 pt-4">
          <Button variant={mode === "paste" ? "default" : "outline"} onClick={() => setMode("paste")} size="sm">
            Paste
          </Button>
          <Button variant={mode === "csv" ? "default" : "outline"} onClick={() => setMode("csv")} size="sm">
            CSV
          </Button>
        </div>

        {/* Inputs */}
        {mode === "paste" ? (
          <div className="space-y-3">
            <div>
              <Label>Paste checklist text (HEADERS in ALL CAPS, items as bullets)</Label>
              <Textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={"KITCHEN OPENING:\n- Turn on hood\n- Check temps\nLOBBY:\n- Wipe tables\n- Stock napkins"}
                className="mt-1"
              />
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={defaultPhotoRequired} onCheckedChange={setDefaultPhotoRequired} />
                <span className="text-sm">Default photo required</span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="photoCount" className="text-sm">Photos per task</Label>
                <Input
                  id="photoCount"
                  type="number"
                  min={1}
                  max={10}
                  value={defaultPhotoCount}
                  onChange={(e) => setDefaultPhotoCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24"
                />
              </div>
            </div>
            <Button variant="outline" onClick={buildPreview}>
              Preview
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Upload CSV</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={defaultPhotoRequired} onCheckedChange={setDefaultPhotoRequired} />
                <span className="text-sm">Default photo required</span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="photoCount2" className="text-sm">Photos per task</Label>
                <Input
                  id="photoCount2"
                  type="number"
                  min={1}
                  max={10}
                  value={defaultPhotoCount}
                  onChange={(e) => setDefaultPhotoCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24"
                />
              </div>
            </div>
            <Button variant="outline" onClick={buildPreview}>
              Preview
            </Button>
            <p className="text-xs text-gray-500">
              Expected headers: <code>task_title, task_description, subitem_title, subitem_description, priority, photo_required, photo_count</code>.
            </p>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="rounded-md border p-3 max-h-72 overflow-auto">
            {preview.map((tpl, i) => (
              <div key={i} className="py-2">
                <div className="font-medium">
                  {tpl.title}{" "}
                  <span className="text-xs text-gray-500">
                    {tpl.photoRequired ? `(photos: ${tpl.photoCount ?? 1})` : ``}
                  </span>
                </div>
                {tpl.description && <div className="text-sm text-gray-600 whitespace-pre-wrap">{tpl.description}</div>}
                {tpl.items && tpl.items.length > 0 && (
                  <ul className="list-disc ml-6 mt-1">
                    {tpl.items.map((it, j) => (
                      <li key={j} className="text-sm">
                        {it.title}
                        {it.photoRequired ? <span className="text-xs text-gray-500"> (photo)</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button disabled={!canSubmit} onClick={doImport}>
            {isSubmitting ? "Importing..." : "Create List"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
