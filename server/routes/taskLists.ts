// server/routes/taskLists.ts
import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { storage } from "../storage";
import { roleEnum, taskStatusEnum } from "@shared/schema";

const r = Router();

// Lists
r.get("/task-lists", authenticateToken, async (_req: Request, res: Response) => {
  try {
    const lists = await storage.getTaskLists();
    res.json(lists || []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch task lists" });
  }
});

r.get("/task-lists/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await storage.getTaskList(id);
    if (!row) return res.status(404).json({ message: "Task list not found" });
    return res.json(row);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch task list" });
  }
});

// ⛔️ CREATE = ADMINS ONLY
r.post(
  "/task-lists",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const me = (req as any).user!;
      const b = req.body ?? {};

      const list = await storage.createTaskList({
        name: b.name ?? b.title,
        description: b.description ?? null,
        assigneeType: b.assigneeType ?? "store_wide",
        assigneeId: b.assigneeId != null ? Number(b.assigneeId) : null,
        recurrenceType: b.recurrenceType ?? null,
        recurrencePattern: b.recurrencePattern ?? null,
        createdBy: me.id,
        storeId: b.storeId != null ? Number(b.storeId) : undefined,
      });

      res.status(201).json({
        ...list,
        createdByName: me.firstName ?? null,
        createdByRole: me.role,
      });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to create task list" });
    }
  }
);

// ⛔️ UPDATE = ADMINS ONLY
r.put(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const b = req.body ?? {};
      const updated = await storage.updateTaskList(id, {
        name: b.name ?? b.title,
        description: b.description,
        assigneeType: b.assigneeType,
        assigneeId: b.assigneeId != null ? Number(b.assigneeId) : undefined,
        recurrenceType: b.recurrenceType,
        recurrencePattern: b.recurrencePattern,
        storeId: b.storeId != null ? Number(b.storeId) : undefined,
      });
      if (!updated) return res.status(404).json({ message: "Task list not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to update task list" });
    }
  }
);

// ⛔️ DELETE = ADMINS ONLY
r.delete(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const ok = await storage.deleteTaskList(id);
      if (!ok) return res.status(404).json({ message: "Task list not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to delete task list" });
    }
  }
);

// Templates for a list (🔐 ADMINS ONLY to create/update)
r.get("/task-lists/:id/templates", authenticateToken, async (req: Request, res: Response) => {
  try {
    const listId = Number(req.params.id);
    if (typeof (storage as any).getTemplatesByList === "function") {
      const rows = await (storage as any).getTemplatesByList(listId);
      return res.json(rows || []);
    }
    const all = await storage.getTaskTemplates();
    return res.json((all || []).filter((t: any) => t.listId === listId && t.isActive !== false));
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Failed to fetch templates" });
  }
});

r.post(
  "/task-lists/:id/templates",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const listId = Number(req.params.id);
      const me = (req as any).user!;
      const b = req.body ?? {};

      const row = await storage.createTaskTemplate({
        listId,
        title: String(b.title || "Task"),
        description: b.description ?? null,
        storeId: null,
        createdBy: me.id,
        recurrenceType: null,
        recurrencePattern: null,
        estimatedDuration: null,
        assigneeType: b.assigneeId ? "specific_employee" : "store_wide",
        assigneeId: b.assigneeId ?? null,
        photoRequired: !!b.photoRequired || Number(b.photoCount ?? 0) > 0,
        photoCount: Number(b.photoCount ?? 0),
        priority: b.priority ?? "normal",
        isActive: true,
      });

      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create template" });
    }
  }
);

r.put(
  "/task-lists/templates/:templateId",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.templateId);
      const b = req.body ?? {};
      const patch: any = {};
      if ("title" in b) patch.title = b.title ?? null;
      if ("description" in b) patch.description = b.description ?? null;
      if ("assigneeId" in b) {
        patch.assigneeId = b.assigneeId ?? null;
        patch.assigneeType = b.assigneeId ? "specific_employee" : "store_wide";
      }
      if ("photoRequired" in b) patch.photoRequired = !!b.photoRequired;
      if ("photoCount" in b) patch.photoCount = Number(b.photoCount ?? 0);
      if ("priority" in b) patch.priority = b.priority ?? "normal";

      const updated = await storage.updateTaskTemplate(id, patch);
      if (!updated) return res.status(404).json({ message: "Template not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update template" });
    }
  }
);

/* ========= Run-page helpers (unchanged) ========= */

r.get("/task-lists/:id/tasks", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : me.storeId;
    if (!qStoreId) return res.status(400).json({ message: "storeId required" });

    const dateStr = new Date().toISOString().slice(0, 10);

    const allTemplates = await storage.getTaskTemplates();
    const templates = (allTemplates || []).filter((t: any) => t.listId === listId && t.isActive !== false);
    const templateIds = templates.map((t: any) => t.id);

    const allTasks = await storage.getTasks({ storeId: qStoreId });
    const byList = (allTasks || []).filter((t: any) => {
      if (!t.templateId || !templateIds.includes(t.templateId)) return false;
      const d = t.scheduledFor ? new Date(t.scheduledFor) : null;
      const dStr = d ? d.toISOString().slice(0, 10) : "";
      return dStr === dateStr;
    });

    res.json(byList);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch tasks for list" });
  }
});

r.post("/task-lists/:id/ensure-task", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const templateId = Number(req.body?.templateId);
    if (!templateId) return res.status(400).json({ message: "templateId required" });

    const qStoreId = req.query.storeId ? Number(req.query.storeId) : me.storeId;
    if (!qStoreId) return res.status(400).json({ message: "storeId required" });

    const all = await storage.getTaskTemplates();
    const template = (all || []).find((t: any) => t.id === templateId && t.listId === listId);
    if (!template) return res.status(404).json({ message: "Template not found in this list" });

    const allTasks = await storage.getTasks({ storeId: qStoreId });
    const today = new Date().toISOString().slice(0, 10);
    const existing = (allTasks || []).find((t: any) => {
      const dStr = t.scheduledFor ? new Date(t.scheduledFor).toISOString().slice(0, 10) : "";
      return t.templateId === templateId && dStr === today;
    });
    if (existing) return res.json(existing);

    const newTask = await storage.createTask({
      templateId,
      title: template.title,
      description: template.description ?? null,
      storeId: qStoreId,
      assigneeType: template.assigneeId ? "specific_employee" : "store_wide",
      assigneeId: template.assigneeId ?? null,
      status: taskStatusEnum.PENDING,
      priority: template.priority ?? "medium",
      photoRequired: !!template.photoRequired,
      photoCount: template.photoCount ?? 1,
      scheduledFor: new Date(),
      notes: null,
    });

    res.status(201).json(newTask);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to ensure task" });
  }
});

// Minimal import stub (admins only)
r.post(
  "/task-lists/import",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req, res) => {
    try {
      const b = req.body ?? {};
      const section = (b.sections && b.sections[0]) || {};
      const name = String(section.title || b.list?.name || "New List");

      const me = (req as any).user!;
      const list = await storage.createTaskList({
        name,
        description: b.description ?? null,
        assigneeType: b.assigneeId ? "specific_employee" : "store_wide",
        assigneeId: b.assigneeId ?? null,
        recurrenceType: b.recurrenceType ?? null,
        recurrencePattern: b.recurrencePattern ?? null,
        createdBy: me.id,
        storeId: b.storeId != null ? Number(b.storeId) : undefined,
      });

      res.status(201).json({ ok: true, created: 1, lists: [{ id: list.id }] });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Import failed" });
    }
  }
);

export default r;
