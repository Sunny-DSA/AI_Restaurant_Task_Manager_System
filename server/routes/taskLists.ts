import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { storage } from "../storage";
import { roleEnum, taskStatusEnum } from "@shared/schema";

const r = Router();

/* ==================== TASK LISTS ==================== */
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

r.post(
  "/task-lists",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
    try {
      const me = (req as any).user!;
      const b = req.body ?? {};
      if (me.role === roleEnum.STORE_MANAGER) {
        if (!me.storeId) return res.status(400).json({ message: "Store assignment required" });
        if (b.storeId && Number(b.storeId) !== Number(me.storeId)) {
          return res.status(403).json({ message: "Cannot create lists for another store" });
        }
      }
      const list = await storage.createTaskList({
        name: b.name ?? b.title,
        description: b.description ?? null,
        assigneeType: b.assigneeType ?? "store_wide",
        assigneeId: b.assigneeId != null ? Number(b.assigneeId) : null,
        recurrenceType: b.recurrenceType ?? null,
        recurrencePattern: b.recurrencePattern ?? null,
        createdBy: me.id,
        storeId: b.storeId
          ? Number(b.storeId)
          : me.role === roleEnum.STORE_MANAGER
          ? Number(me.storeId)
          : undefined,
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

r.put(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
    try {
      const me = (req as any).user!;
      const id = Number(req.params.id);
      const b = req.body ?? {};
      if (me.role === roleEnum.STORE_MANAGER && b.storeId && Number(b.storeId) !== Number(me.storeId)) {
        return res.status(403).json({ message: "Cannot assign lists to another store" });
      }
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

r.delete(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
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

/* ==================== TEMPLATES ==================== */
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
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
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
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
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

/* ==================== RUN / TODAY / ENSURE ==================== */

// Return today's tasks for this list + store (optionally ensure they exist)
r.get("/task-lists/:id/tasks", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);

    // choose storeId
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : me.storeId;
    if (!qStoreId) return res.status(400).json({ message: "storeId required" });

    const dateStr = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const ensure = String(req.query.ensure || "") === "1";

    // Which templates belong to this list
    const allTemplates = await storage.getTaskTemplates();
    const templates = (allTemplates || []).filter((t: any) => t.listId === listId && t.isActive !== false);
    const templateIds = new Set(templates.map((t: any) => t.id));

    // Existing tasks for that store & day
    const allTasks = await storage.getTasks({ storeId: qStoreId });
    let todayTasks = (allTasks || []).filter((t: any) => {
      if (!t.templateId || !templateIds.has(t.templateId)) return false;
      const d = t.scheduledFor ? new Date(t.scheduledFor) : null;
      const dStr = d ? d.toISOString().slice(0, 10) : "";
      return dStr === dateStr;
    });

    // Ensure mode: create tasks for any template missing today
    if (ensure && templates.length > 0) {
      const haveByTpl = new Set<number>(todayTasks.map((t: any) => t.templateId).filter(Boolean));
      const toCreate = templates.filter((tpl: any) => !haveByTpl.has(tpl.id));

      for (const t of toCreate) {
        const created = await storage.createTask({
          templateId: t.id,
          title: t.title,
          description: t.description ?? null,
          storeId: qStoreId,
          assigneeType: t.assigneeId ? "specific_employee" : "store_wide",
          assigneeId: t.assigneeId ?? null,
          status: taskStatusEnum.PENDING,
          priority: t.priority ?? "medium",
          photoRequired: !!t.photoRequired,
          photoCount: t.photoCount ?? 1,
          scheduledFor: new Date(),
          notes: null,
        });
        todayTasks.push(created);
      }
    }

    res.json(todayTasks);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch tasks for list" });
  }
});

// Ensure today's task exists for a given template (used by Run page “Start”)
r.post("/task-lists/:id/ensure-task", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const templateId = Number(req.body?.templateId);
    if (!templateId) return res.status(400).json({ message: "templateId required" });

    const list = await storage.getTaskList(listId);
    if (!list) return res.status(404).json({ message: "Task list not found" });

    // pick storeId: admins can pass ?storeId=, others use their store
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const targetStoreId =
      (me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN) && qStoreId ? qStoreId : me.storeId;
    if (!targetStoreId) return res.status(400).json({ message: "storeId required" });

    // template must belong to this list
    const all = await storage.getTaskTemplates();
    const template = (all || []).find((t: any) => t.id === templateId && t.listId === listId);
    if (!template) return res.status(404).json({ message: "Template not found in this list" });

    // already exists today?
    const allTasks = await storage.getTasks({ storeId: targetStoreId });
    const today = new Date().toISOString().slice(0, 10);
    const existing = (allTasks || []).find((t: any) => {
      const dStr = t.scheduledFor ? new Date(t.scheduledFor).toISOString().slice(0, 10) : "";
      return t.templateId === templateId && dStr === today;
    });
    if (existing) return res.json(existing);

    // create today's task
    const newTask = await storage.createTask({
      templateId,
      title: template.title,
      description: template.description ?? null,
      storeId: targetStoreId,
      assigneeType: template.assigneeId ? "specific_employee" : "store_wide",
      assigneeId: template.assigneeId ?? null,
      status: taskStatusEnum.PENDING,
      priority: template.priority ?? "medium",
      photoRequired: !!template.photoRequired,
      photoCount: template.photoCount ?? 1,
      scheduledFor: new Date(),
      notes: null,
    });

    return res.status(201).json(newTask);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to ensure task" });
  }
});

export default r;
