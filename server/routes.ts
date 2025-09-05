// server/routes.ts
import { Router, Request, Response } from "express";
import { roleEnum, taskStatusEnum } from "@shared/schema";
import { authenticateToken, requireRole } from "./middleware/auth";
import { requireActiveCheckin } from "./middleware/requireCheckin";
import { upload } from "./middleware/upload";
import { withinFence } from "./utils/geo";
import { storage } from "./storage";
import { AuthService } from "./services/authService";

// Toggle geofence enforcement via env.
// If ENFORCE_GEOFENCE is not set, enforce only in production.
const ENFORCE_GEOFENCE =
  process.env.ENFORCE_GEOFENCE !== undefined
    ? process.env.ENFORCE_GEOFENCE === "true"
    : process.env.NODE_ENV === "production";

const router = Router();

/* =========================================
   HEALTH
========================================= */
router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* =========================================
   AUTH
========================================= */

/**
 * POST /api/auth/login
 * body: { email, password, rememberMe? }
 *    OR { pin, storeId, rememberMe?, latitude?, longitude? }
 */
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password, pin, storeId, rememberMe, latitude, longitude } =
      req.body ?? {};
    let user: any;

    // Admin (email/password)
    if (email && password) {
      try {
        user = await AuthService.authenticateWithEmail(
          String(email),
          String(password)
        );
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("user not found")) {
          return res
            .status(401)
            .json({ message: "No account found with these credentials." });
        }
        if (msg.includes("invalid password") || msg.includes("wrong password")) {
          return res
            .status(401)
            .json({ message: "Incorrect password. Please try again." });
        }
        return res.status(401).json({
          message:
            "Login failed. Please check your credentials and try again.",
        });
      }
    }
    // Employee/manager (PIN + storeId)
    else if (pin && storeId) {
      const store = await storage.getStore(Number(storeId));
      if (!store) return res.status(404).json({ message: "Store not found." });

      const hasFence =
        store.latitude != null &&
        store.longitude != null &&
        store.geofenceRadius != null &&
        Number(store.geofenceRadius) > 0;

      if (hasFence && ENFORCE_GEOFENCE) {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return res.status(400).json({
            message:
              "Location required for store login. Please enable location services and try again.",
          });
        }
        const center = {
          lat: Number(store.latitude),
          lng: Number(store.longitude),
        };
        const ok = withinFence(
          { lat, lng },
          center,
          Number(store.geofenceRadius)
        );
        if (!ok) {
          return res.status(403).json({
            message:
              "Outside store geofence. Please log in from inside the store’s radius.",
          });
        }
      }

      try {
        user = await AuthService.authenticateWithPin(
          String(pin),
          Number(storeId)
        );
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("incorrect pin") || msg.includes("invalid pin")) {
          return res
            .status(401)
            .json({ message: "Incorrect PIN. Please try again." });
        }
        if (msg.includes("user not found") || msg.includes("no user")) {
          return res
            .status(401)
            .json({ message: "No account found with these credentials." });
        }
        return res.status(401).json({
          message:
            "Login failed. Please check your credentials and try again.",
        });
      }
    } else {
      return res
        .status(400)
        .json({ message: "Please provide valid login details." });
    }

    // Set session
    (req.session as any).userId = user.id;
    (req.session as any).role = user.role;

    // Remember me: extend cookie to 30 days; otherwise session-only
    if (rememberMe === true) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      storeId: user.storeId,
    });
  } catch {
    return res
      .status(500)
      .json({ message: "Unexpected error during login. Please try again." });
  }
});

// GET /api/auth/me
router.get("/auth/me", authenticateToken, (req, res) => {
  return res.json((req as any).user);
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res) => {
  const COOKIE = "sid";
  try {
    req.session?.destroy(() => {
      res.clearCookie(COOKIE);
      res.status(200).json({ ok: true });
    });
  } catch {
    res.clearCookie(COOKIE);
    res.status(200).json({ ok: true });
  }
});

/**
 * POST /api/auth/verify-qr
 * body: { qrData } — simple JSON like {"storeId":123}
 */
router.post("/auth/verify-qr", async (req, res) => {
  try {
    const { qrData } = req.body ?? {};
    const payload = JSON.parse(String(qrData));
    const id = Number(payload?.storeId);
    if (!id) return res.status(400).json({ message: "Invalid QR" });
    const store = await storage.getStore(id);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json({ success: true, storeId: id, storeName: store.name });
  } catch {
    res.status(400).json({ message: "Invalid QR" });
  }
});

/**
 * POST /api/auth/checkin
 * body: { storeId, latitude, longitude }
 */
router.post(
  "/auth/checkin",
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = (req as any).user as { id: number } | undefined;
    if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

    const { storeId, latitude, longitude } = req.body ?? {};
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const store = await storage.getStore(Number(storeId));
    if (!store) return res.status(404).json({ message: "Store not found" });

    if (
      store.latitude != null &&
      store.longitude != null &&
      store.geofenceRadius
    ) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res
          .status(400)
          .json({ message: "Location required for geofenced check-in" });
      }
      const center = {
        lat: Number(store.latitude),
        lng: Number(store.longitude),
      };
      const ok = withinFence(
        { lat, lng },
        center,
        Number(store.geofenceRadius)
      );
      if (!ok) return res.status(403).json({ message: "Outside store geofence" });
    }

    const snapshotFence =
      store.latitude != null &&
      store.longitude != null &&
      store.geofenceRadius
        ? {
            lat: Number(store.latitude),
            lng: Number(store.longitude),
            radiusM: Number(store.geofenceRadius),
          }
        : undefined;

    (req as any).session.activeCheckin = {
      storeId: Number(storeId),
      storeName: store.name,
      fence: snapshotFence,
      startedAt: new Date().toISOString(),
    };

    if ((storage as any).setActiveCheckin) {
      (storage as any).setActiveCheckin(
        user.id,
        (req as any).session.activeCheckin
      );
    }

    res.json({ success: true });
  }
);

/**
 * POST /api/auth/checkout
 */
router.post("/auth/checkout", authenticateToken, async (req, res) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });
  (req as any).session.activeCheckin = undefined;
  if ((storage as any).clearActiveCheckin) {
    (storage as any).clearActiveCheckin(user.id);
  }
  res.json({ success: true });
});

/* =========================================
   USERS
========================================= */

/**
 * GET /api/users?storeId=#
 *
 * Admin/Master Admin:
 *   - with ?storeId=123 -> users from that store
 *   - without query     -> all users across stores (fallback aggregates)
 * Store manager:
 *   - users from their store
 * Employee:
 *   - only themselves
 */
router.get("/users", authenticateToken, async (req, res) => {
  try {
    const me = (req as any).user!;
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const isAdmin =
      me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN;

    const includeMe = async (arr: any[]) => {
      const meFull = await storage.getUser(me.id);
      if (meFull && !arr.find((u) => u.id === meFull.id)) arr.push(meFull);
    };

    if (isAdmin) {
      if (qStoreId) {
        let list: any[] = [];
        if (typeof (storage as any).getUsersByStore === "function") {
          list = await (storage as any).getUsersByStore(qStoreId);
        }
        await includeMe(list);
        return res.json(list || []);
      }

      if (typeof (storage as any).getAllUsers === "function") {
        const all = await (storage as any).getAllUsers();
        await includeMe(all);
        return res.json(all || []);
      }

      const stores = (await storage.getStores()) || [];
      const out: any[] = [];
      for (const s of stores) {
        if (typeof (storage as any).getUsersByStore === "function") {
          const list = await (storage as any).getUsersByStore(s.id);
          for (const u of list || []) {
            if (!out.find((x) => x.id === u.id)) out.push(u);
          }
        }
      }
      await includeMe(out);
      return res.json(out);
    }

    if (me.role === roleEnum.STORE_MANAGER) {
      if (!me.storeId) {
        const onlyMe = await storage.getUser(me.id);
        return res.json(onlyMe ? [onlyMe] : []);
      }
      let list: any[] = [];
      if (typeof (storage as any).getUsersByStore === "function") {
        list = await (storage as any).getUsersByStore(me.storeId);
      }
      await includeMe(list);
      return res.json(list || []);
    }

    const self = await storage.getUser(me.id);
    return res.json(self ? [self] : []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch users" });
  }
});

/**
 * POST /api/users
 */
router.post(
  "/users",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const created = await AuthService.createUser(
        req.body as any,
        req.body?.password
      );
      res.json(created);
    } catch (err: any) {
      res
        .status(400)
        .json({ message: err?.message || "Failed to create user" });
    }
  }
);

// PUT /api/users/:id/pin  -> set a specific 4-digit PIN for a user
router.put(
  "/users/:id/pin",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pin: string = String(req.body?.pin ?? "");

      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ message: "PIN must be exactly 4 digits" });
      }

      const me = (req as any).user;
      if (me.role === roleEnum.STORE_MANAGER) {
        const target = await storage.getUser(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        if (target.storeId !== me.storeId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      await AuthService.setUserPin(id, pin);
      return res.json({ success: true });
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err?.message || "Failed to set PIN" });
    }
  }
);

/* =========================================
   TASK LISTS — CRUD (hyphenated paths)
========================================= */

// GET /api/task-lists  -> list all active task lists
router.get("/task-lists", authenticateToken, async (_req, res) => {
  try {
    const lists = await storage.getTaskLists();
    res.json(lists || []);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err?.message || "Failed to fetch task lists" });
  }
});

// GET /api/task-lists/:id
router.get("/task-lists/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await storage.getTaskList(id);
    if (!row) return res.status(404).json({ message: "Task list not found" });
    return res.json(row);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err?.message || "Failed to fetch task list" });
  }
});

// GET /api/task-lists/:id/templates  -> templates that belong to a list
router.get("/task-lists/:id/templates", authenticateToken, async (req, res) => {
  try {
    const listId = Number(req.params.id);
    if (typeof (storage as any).getTemplatesByList === "function") {
      const rows = await (storage as any).getTemplatesByList(listId);
      return res.json(rows || []);
    }
    const all = await storage.getTaskTemplates();
    return res.json(
      (all || []).filter(
        (t: any) => t.listId === listId && t.isActive !== false
      )
    );
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message || "Failed to fetch templates" });
  }
});

// POST /api/task-lists  -> create list
router.post(
  "/task-lists",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const me = (req as any).user!;
      const b = req.body ?? {};

      if (me.role === roleEnum.STORE_MANAGER) {
        if (!me.storeId)
          return res.status(400).json({ message: "Store assignment required" });
        if (b.storeId && Number(b.storeId) !== Number(me.storeId)) {
          return res
            .status(403)
            .json({ message: "Cannot create lists for another store" });
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
      res.status(201).json(list);
    } catch (err: any) {
      res
        .status(400)
        .json({ message: err?.message || "Failed to create task list" });
    }
  }
);

// PUT /api/task-lists/:id -> update list
router.put(
  "/task-lists/:id",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const me = (req as any).user!;
      const id = Number(req.params.id);
      const b = req.body ?? {};

      if (
        me.role === roleEnum.STORE_MANAGER &&
        b.storeId &&
        Number(b.storeId) !== Number(me.storeId)
      ) {
        return res
          .status(403)
          .json({ message: "Cannot assign lists to another store" });
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
      res
        .status(400)
        .json({ message: err?.message || "Failed to update task list" });
    }
  }
);

// DELETE /api/task-lists/:id -> soft delete
router.delete(
  "/task-lists/:id",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const ok = await storage.deleteTaskList(id);
      if (!ok) return res.status(404).json({ message: "Task list not found" });
      res.json({ success: true });
    } catch (err: any) {
      res
        .status(400)
        .json({ message: err?.message || "Failed to delete task list" });
    }
  }
);

// POST /api/task-lists/:id/duplicate -> copy list
router.post(
  "/task-lists/:id/duplicate",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const me = (req as any).user!;
      const copy = await storage.duplicateTaskList(id, me.id);
      res.json(copy);
    } catch (err: any) {
      res
        .status(400)
        .json({ message: err?.message || "Failed to duplicate task list" });
    }
  }
);

/* =========================================
   TASK LISTS — IMPORT (paste/CSV)
========================================= */
router.post(
  "/task-lists/import",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const me = (req as any).user!;
      const b = req.body ?? {};
      const sections = Array.isArray(b.sections) ? b.sections : [];
      if (sections.length === 0) {
        return res.status(400).json({ message: "sections[] required" });
      }

      const createdLists: any[] = [];
      for (const sec of sections) {
        const list = await storage.createTaskList({
          name: String(sec.title || "Untitled"),
          description: null,
          createdBy: me.id,
          assigneeType: b.assigneeType ?? "store_wide",
          assigneeId: b.assigneeId ?? null,
          recurrenceType:
            b.recurrenceType === "none" ? null : b.recurrenceType ?? null,
          recurrencePattern: b.recurrencePattern ?? null,
          isActive: true,
        });

        const items: any[] = Array.isArray(sec.items) ? sec.items : [];
        for (const it of items) {
          await storage.createTaskTemplate({
            listId: list.id,
            title: String(it.title || "Task"),
            description: it.description ?? null,
            storeId: null,
            createdBy: me.id,
            recurrenceType:
              b.recurrenceType === "none" ? null : b.recurrenceType ?? null,
            recurrencePattern: b.recurrencePattern ?? null,
            estimatedDuration: null,
            assigneeType: b.assigneeType ?? "store_wide",
            assigneeId: b.assigneeId ?? null,
            photoRequired:
              typeof it.photoRequired === "boolean"
                ? it.photoRequired
                : !!b.defaultPhotoRequired,
            photoCount:
              typeof it.photoCount === "number" && it.photoCount > 0
                ? it.photoCount
                : typeof b.defaultPhotoCount === "number" &&
                  b.defaultPhotoCount > 0
                ? Number(b.defaultPhotoCount)
                : 1,
            priority: it.priority ?? "normal",
            isActive: true,
          });
        }

        createdLists.push(list);
      }

      res
        .status(201)
        .json({ ok: true, created: createdLists.length, lists: createdLists });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Import failed" });
    }
  }
);

/* =========================================
   TASK LISTS — RUN (generate runtime tasks)
========================================= */
router.post(
  "/task-lists/:id/run",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    const listId = Number(req.params.id);
    const me = (req as any).user!;
    try {
      const list = await storage.getTaskList(listId);
      if (!list) return res.status(404).json({ message: "Task list not found" });

      const targetStoreId =
        req.query.storeId != null
          ? Number(req.query.storeId)
          : req.body?.storeId != null
          ? Number(req.body.storeId)
          : me.storeId;

      if (
        me.role === roleEnum.STORE_MANAGER &&
        (!targetStoreId || targetStoreId !== me.storeId)
      ) {
        return res.status(403).json({ message: "Unauthorized store" });
      }
      if (!targetStoreId)
        return res.status(400).json({ message: "storeId required" });

      let templates: any[] = [];
      if (typeof (storage as any).getTemplatesByList === "function") {
        templates = await (storage as any).getTemplatesByList(listId);
      } else {
        const all = await storage.getTaskTemplates();
        templates = (all || []).filter(
          (t: any) => t.listId === listId && t.isActive !== false
        );
      }

      const createdTasks: any[] = [];
      for (const t of templates) {
        const newTask = await storage.createTask({
          templateId: t.id, // link task -> template (column should exist in storage)
          title: t.title,
          description: t.description ?? null,
          storeId: targetStoreId,
          assigneeType: t.assigneeType ?? "store_wide",
          assigneeId: t.assigneeId ?? null,
          status: taskStatusEnum.PENDING,
          priority: t.priority ?? "medium",
          photoRequired: !!t.photoRequired,
          photoCount: t.photoCount ?? 1,
          scheduledFor: new Date(),
          notes: null,
        });
        createdTasks.push(newTask);
      }

      res.status(201).json({ created: createdTasks.length, tasks: createdTasks });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to run list" });
    }
  }
);

/**
 * Optional helper: today's tasks for a list+store
 * GET /api/task-lists/:id/tasks?storeId=#&date=YYYY-MM-DD
 */
router.get("/task-lists/:id/tasks", authenticateToken, async (req, res) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : me.storeId;
    if (!qStoreId) return res.status(400).json({ message: "storeId required" });

    const dateStr =
      (req.query.date as string | undefined) ??
      new Date().toISOString().slice(0, 10);

    const allTemplates = await storage.getTaskTemplates();
    const templateIds = (allTemplates || [])
      .filter((t: any) => t.listId === listId && t.isActive !== false)
      .map((t: any) => t.id);

    const allTasks = await storage.getTasks({ storeId: qStoreId });
    const byList = (allTasks || []).filter((t: any) => {
      if (!t.templateId || !templateIds.includes(t.templateId)) return false;
      const d = t.scheduledFor ? new Date(t.scheduledFor) : null;
      const dStr = d ? d.toISOString().slice(0, 10) : "";
      return dStr === dateStr;
    });

    res.json(byList);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err?.message || "Failed to fetch tasks for list" });
  }
});

/**
 * NEW: Ensure (get or create) today's task for a specific template+store.
 * POST /api/task-lists/:listId/templates/:templateId/ensure-task?storeId=#
 * body: { scheduledFor?: ISOString }
 */
router.post(
  "/task-lists/:listId/templates/:templateId/ensure-task",
  authenticateToken,
  async (req, res) => {
    try {
      const me = (req as any).user!;
      const listId = Number(req.params.listId);
      const templateId = Number(req.params.templateId);
      const targetStoreId =
        req.query.storeId != null
          ? Number(req.query.storeId)
          : me.storeId;

      if (!Number.isFinite(listId) || !Number.isFinite(templateId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }
      if (!targetStoreId) {
        return res.status(400).json({ message: "storeId required" });
      }
      // Store managers can only work within their store
      if (
        me.role === roleEnum.STORE_MANAGER &&
        targetStoreId !== me.storeId
      ) {
        return res.status(403).json({ message: "Unauthorized store" });
      }

      // Validate template belongs to list
      const templ = (await storage.getTaskTemplates()).find(
        (t: any) => Number(t.id) === templateId && Number(t.listId) === listId
      );
      if (!templ) return res.status(404).json({ message: "Template not found" });

      // Look up today's task for this template+store
      const dateStr =
        (req.body?.scheduledFor as string | undefined) ??
        new Date().toISOString().slice(0, 10);
      const allTasks = await storage.getTasks({ storeId: targetStoreId });
      const existing = (allTasks || []).find((t: any) => {
        if (Number(t.templateId) !== templateId) return false;
        const d = t.scheduledFor ? new Date(t.scheduledFor) : null;
        const dStr = d ? d.toISOString().slice(0, 10) : "";
        return dStr === dateStr;
      });
      if (existing) return res.json({ created: false, task: existing });

      // Create it
      const task = await storage.createTask({
        templateId,
        title: templ.title,
        description: templ.description ?? null,
        storeId: targetStoreId,
        assigneeType: templ.assigneeType ?? "store_wide",
        assigneeId: templ.assigneeId ?? null,
        status: taskStatusEnum.PENDING,
        priority: templ.priority ?? "medium",
        photoRequired: !!templ.photoRequired,
        photoCount: templ.photoCount ?? 1,
        scheduledFor: new Date(dateStr),
        notes: null,
      });

      return res.status(201).json({ created: true, task });
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err?.message || "Failed to ensure task" });
    }
  }
);

/* =========================================
   TASKS — LISTING
========================================= */
router.get("/tasks/my", authenticateToken, async (req, res) => {
  const user = (req as any).user!;
  const rows = await storage.getTasks({ assigneeId: user.id });
  res.json(rows);
});

router.get("/tasks/available", authenticateToken, async (req, res) => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  if (!storeId) return res.status(400).json({ message: "storeId required" });
  const rows = await storage.getTasks({
    storeId,
    status: taskStatusEnum.AVAILABLE,
  });
  res.json(rows);
});

router.get("/tasks", authenticateToken, async (req, res) => {
  const user = (req as any).user!;

  if (user.role === roleEnum.EMPLOYEE) {
    const mine = await storage.getTasks({ assigneeId: user.id });
    return res.json(mine);
  }

  if (user.role === roleEnum.STORE_MANAGER) {
    if (!user.storeId) {
      return res.status(400).json({ message: "Store assignment required" });
    }
    const rows = await storage.getTasks({ storeId: user.storeId });
    return res.json(rows);
  }

  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  const rows = await storage.getTasks({ storeId });
  return res.json(rows);
});

/* =========================================
   TASKS — CREATE / UPDATE / DELETE
========================================= */
router.post(
  "/tasks",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    const user = (req as any).user!;
    const b = req.body ?? {};

    if (!b.title || !b.storeId) {
      return res
        .status(400)
        .json({ message: "title and storeId are required" });
    }

    if (
      user.role === roleEnum.STORE_MANAGER &&
      user.storeId !== Number(b.storeId)
    ) {
      return res
        .status(403)
        .json({ message: "Cannot create tasks for another store" });
    }

    const newTask = await storage.createTask({
      title: String(b.title),
      description: b.description ?? null,
      priority: b.priority ?? "normal",
      storeId: Number(b.storeId),
      assigneeType: b.assigneeId ? "specific_employee" : "store_wide",
      assigneeId: b.assigneeId != null ? Number(b.assigneeId) : null,
      status: taskStatusEnum.PENDING,
      dueAt: b.dueAt ? new Date(b.dueAt) : null,
      scheduledFor: b.scheduledFor ? new Date(b.scheduledFor) : null,
      estimatedDuration:
        b.estimatedDuration != null ? Number(b.estimatedDuration) : null,
      photoRequired: !!b.photoRequired,
      photoCount: b.photoCount != null ? Number(b.photoCount) : 1,
      geoLat: b.geoLat != null ? String(b.geoLat) : null,
      geoLng: b.geoLng != null ? String(b.geoLng) : null,
      geoRadiusM: b.geoRadiusM != null ? Number(b.geoRadiusM) : null,
      notes: b.notes ?? null,
    });

    res.json(newTask);
  }
);

router.put(
  "/tasks/:id",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    const user = (req as any).user!;
    const id = Number(req.params.id);
    const patch = req.body ?? {};

    if (user.role === roleEnum.STORE_MANAGER) {
      const t = await storage.getTask(id);
      if (t && t.storeId !== user.storeId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const updates: any = {};
    if ("title" in patch) updates.title = patch.title ?? null;
    if ("description" in patch) updates.description = patch.description ?? null;
    if ("priority" in patch) updates.priority = patch.priority ?? "normal";
    if ("assigneeId" in patch) {
      updates.assigneeId =
        patch.assigneeId != null ? Number(patch.assigneeId) : null;
      updates.assigneeType = patch.assigneeId
        ? "specific_employee"
        : "store_wide";
    }
    if ("status" in patch)
      updates.status = patch.status ?? taskStatusEnum.PENDING;
    if ("dueAt" in patch) updates.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    if ("scheduledFor" in patch)
      updates.scheduledFor = patch.scheduledFor
        ? new Date(patch.scheduledFor)
        : null;
    if ("estimatedDuration" in patch) {
      updates.estimatedDuration =
        patch.estimatedDuration != null
          ? Number(patch.estimatedDuration)
          : null;
    }
    if ("photoRequired" in patch) updates.photoRequired = !!patch.photoRequired;
    if ("photoCount" in patch) updates.photoCount = Number(patch.photoCount) || 1;
    if ("geoLat" in patch) updates.geoLat = patch.geoLat != null ? String(patch.geoLat) : null;
    if ("geoLng" in patch) updates.geoLng = patch.geoLng != null ? String(patch.geoLng) : null;
    if ("geoRadiusM" in patch) {
      updates.geoRadiusM =
        patch.geoRadiusM != null ? Number(patch.geoRadiusM) : null;
    }
    if ("notes" in patch) updates.notes = patch.notes ?? null;

    const updated = await storage.updateTask(id, updates);
    res.json(updated);
  }
);

router.delete(
  "/tasks/:id",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    const user = (req as any).user!;
    const id = Number(req.params.id);

    if (user.role === roleEnum.STORE_MANAGER) {
      const t = await storage.getTask(id);
      if (t && t.storeId !== user.storeId)
        return res.status(403).json({ message: "Forbidden" });
    }

    await storage.deleteTask(id);
    res.json({ success: true });
  }
);

/* =========================================
   TASKS — CLAIM / TRANSFER
========================================= */
router.post("/tasks/:id/claim", authenticateToken, async (req, res) => {
  const user = (req as any).user!;
  if (user.role !== roleEnum.EMPLOYEE) {
    return res.status(403).json({ message: "Employees only" });
  }
  const id = Number(req.params.id);
  const { latitude, longitude } = req.body ?? {};

  const t = await storage.getTask(id);
  if (!t) return res.status(404).json({ message: "Task not found" });
  if (t.assigneeId && t.assigneeId !== user.id) {
    return res.status(403).json({ message: "Not your task" });
  }

  const fence = (req as any).session?.activeCheckin?.fence as
    | { lat: number; lng: number; radiusM: number }
    | undefined;
  if (fence) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Location required for claim" });
    }
    const ok = withinFence(
      { lat, lng },
      { lat: fence.lat, lng: fence.lng },
      fence.radiusM
    );
    if (!ok) return res.status(403).json({ message: "Outside store geofence" });
  }

  const updated = await storage.claimTask(id, user.id);
  res.json(updated);
});

router.post(
  "/tasks/:id/transfer",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    const user = (req as any).user!;
    const id = Number(req.params.id);
    const { toUserId } = req.body ?? {};
    if (!toUserId) return res.status(400).json({ message: "toUserId required" });

    const t = await storage.getTask(id);
    if (!t) return res.status(404).json({ message: "Task not found" });

    if (user.role === roleEnum.STORE_MANAGER && t.storeId !== user.storeId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const target = await storage.getUser(Number(toUserId));
    if (!target)
      return res.status(404).json({ message: "Target user not found" });

    const updated = await storage.transferTask(
      id,
      user.id,
      Number(toUserId),
      req.body?.reason
    );
    res.json(updated);
  }
);

/* =========================================
   TASKS — PHOTO UPLOAD & COMPLETE (geofenced)
========================================= */
router.post(
  "/tasks/:id/photos",
  authenticateToken,
  requireActiveCheckin,
  upload.single("photo"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user!;
      const lat =
        req.body?.latitude != null ? Number(req.body.latitude) : undefined;
      const lng =
        req.body?.longitude != null ? Number(req.body.longitude) : undefined;
      const point = lat != null && lng != null ? { lat, lng } : undefined;

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (
        user.role === roleEnum.EMPLOYEE &&
        task.assigneeId &&
        task.assigneeId !== user.id
      ) {
        return res
          .status(403)
          .json({ message: "You can only upload for your assigned task" });
      }

      // Choose fence from activeCheckin snapshot (store fence)
      const activeCheckin = (req as any).activeCheckin as {
        fence?: { lat: number; lng: number; radiusM: number };
      };
      const taskFence = activeCheckin?.fence;

      if (taskFence) {
        if (
          !point ||
          !withinFence(
            point,
            { lat: taskFence.lat, lng: taskFence.lng },
            taskFence.radiusM
          )
        ) {
          return res.status(403).json({
            message: "Photo must be taken at the store (outside geofence)",
          });
        }
      }

      const f = req.file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No photo uploaded" });

      const url = `/uploads/${f.filename}`;

      await storage.createTaskPhoto({
        taskId: id,
        taskItemId: req.body?.taskItemId
          ? Number(req.body.taskItemId)
          : undefined,
        url,
        filename: f.originalname || f.filename,
        mimeType: f.mimetype,
        fileSize: f.size,
        latitude: lat,
        longitude: lng,
        uploadedBy: user.id,
      });

      const newCount = (task.photosUploaded ?? 0) + 1;
      await storage.updateTask(id, { photosUploaded: newCount });

      res.json({ success: true, photoUrl: url, photosUploaded: newCount });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Upload failed" });
    }
  }
);

router.post(
  "/tasks/:id/complete",
  authenticateToken,
  requireActiveCheckin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user!;
      const { latitude, longitude, overridePhotoRequirement, notes } =
        req.body ?? {};

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (user.role === roleEnum.EMPLOYEE) {
        if (task.assigneeId && task.assigneeId !== user.id) {
          return res.status(403).json({ message: "Not your task" });
        }
        const need = task.photoCount ?? 1;
        const have = task.photosUploaded ?? 0;
        if (task.photoRequired && have < need && !overridePhotoRequirement) {
          return res
            .status(400)
            .json({ message: "Photo required before completion" });
        }
      }

      const point =
        typeof latitude === "number" && typeof longitude === "number"
          ? { lat: Number(latitude), lng: Number(longitude) }
          : undefined;

      const activeCheckin = (req as any).activeCheckin as {
        fence?: { lat: number; lng: number; radiusM: number };
      };
      const taskFence = activeCheckin?.fence;

      if (taskFence) {
        if (
          !point ||
          !withinFence(
            point,
            { lat: taskFence.lat, lng: taskFence.lng },
            taskFence.radiusM
          )
        ) {
          return res.status(403).json({
            message: "Completion must occur at the store (outside geofence)",
          });
        }
      }

      const updated = await storage.updateTask(id, {
        status: taskStatusEnum.COMPLETED,
        completedAt: new Date(),
        completedBy: user.id,
        notes: notes ?? task.notes ?? null,
      });

      res.json({ success: true, task: updated });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Completion failed" });
    }
  }
);

/* =========================================
   STORES
========================================= */

// GET /api/stores - Get all stores (admin) or user's store
router.get("/stores", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;

    if (user.role === "master_admin" || user.role === "admin") {
      const stores = await storage.getStores();
      return res.json(stores || []);
    } else if (user.storeId) {
      const store = await storage.getStore(user.storeId);
      return res.json(store ? [store] : []);
    }

    return res.json([]);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch stores" });
  }
});

// GET /api/stores/:id - Get specific store
router.get("/stores/:id", authenticateToken, async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;

    if (
      user.role !== "master_admin" &&
      user.role !== "admin" &&
      user.storeId !== storeId
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized to view this store" });
    }

    const store = await storage.getStore(storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found" });
    }

    res.json(store);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err?.message || "Failed to fetch store" });
  }
});

// POST /api/stores - Create new store (admin only)
router.post(
  "/stores",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req, res) => {
    try {
      const storeData = req.body;
      const newStore = await storage.createStore(storeData);
      res.status(201).json(newStore);
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err?.message || "Failed to create store" });
    }
  }
);

// PUT /api/stores/:id - Update store (admin only)
router.put(
  "/stores/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      const updates = req.body;

      const updatedStore = await storage.updateStore(storeId, updates);
      if (!updatedStore) {
        return res.status(404).json({ message: "Store not found" });
      }

      res.json(updatedStore);
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err?.message || "Failed to update store" });
    }
  }
);

// GET /api/stores/:id/stats - Get store statistics
router.get("/stores/:id/stats", authenticateToken, async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;

    if (
      user.role !== "master_admin" &&
      user.role !== "admin" &&
      user.storeId !== storeId
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized to view store stats" });
    }

    // Get task stats
    const tasks = await storage.getTasks({ storeId });
    const taskStats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t: any) => t.status === "completed").length,
      pendingTasks: tasks.filter((t: any) => t.status === "pending").length,
      inProgressTasks: tasks.filter((t: any) => t.status === "in_progress")
        .length,
    };

    // Get user stats (fallback if backend lacks getUsersByStore)
    let users: any[] = [];
    if (typeof (storage as any).getUsersByStore === "function") {
      users = await (storage as any).getUsersByStore(storeId);
    } else {
      const byTaskUserIds = new Set<number>();
      for (const t of tasks) {
        [t.assigneeId, t.claimedBy, t.completedBy].forEach((id: any) => {
          if (typeof id === "number") byTaskUserIds.add(id);
        });
      }
      users = (
        await Promise.all(
          Array.from(byTaskUserIds).map((id) => storage.getUser(id))
        )
      ).filter(Boolean) as any[];
    }

    const userStats = {
      totalEmployees: users.length,
      activeEmployees: users.filter((u: any) => u?.isActive).length,
    };

    res.json({ ...taskStats, ...userStats });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err?.message || "Failed to fetch store stats" });
  }
});

// POST /api/stores/:id/generate-qr - Generate QR code for store
router.post(
  "/stores/:id/generate-qr",
  authenticateToken,
  requireRole([
    roleEnum.MASTER_ADMIN,
    roleEnum.ADMIN,
    roleEnum.STORE_MANAGER,
  ]),
  async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      const user = (req as any).user;

      if (user.role === roleEnum.STORE_MANAGER && user.storeId !== storeId) {
        return res
          .status(403)
          .json({ message: "Unauthorized to generate QR for this store" });
      }

      const store = await storage.getStore(storeId);
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }

      // Simple payload; integrate real QR later if needed
      const qrData = JSON.stringify({ storeId, timestamp: Date.now() });
      const qrCode = `data:image/svg+xml;base64,${Buffer.from(qrData).toString(
        "base64"
      )}`;

      res.json({ qrCode });
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err?.message || "Failed to generate QR code" });
    }
  }
);

/* =========================================
   COMPAT ALIASES (optional)
   If any old UI still calls /api/tasklists* (no hyphen)
========================================= */
router.get("/tasklists", authenticateToken, async (_req, res) => {
  try {
    const lists = await storage.getTaskLists();
    res.json(lists || []);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Failed to fetch task lists" });
  }
});
router.get("/tasklists/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await storage.getTaskList(id);
    if (!row) return res.status(404).json({ message: "Task list not found" });
    return res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Failed to fetch task list" });
  }
});

export default router;
