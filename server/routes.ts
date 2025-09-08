// server/routes.ts
import { Router, Request, Response } from "express";
import { roleEnum, taskStatusEnum } from "@shared/schema";
import { authenticateToken, requireRole } from "./middleware/auth";
import { requireActiveCheckin } from "./middleware/requireCheckin";
import { upload } from "./middleware/upload";
import { withinFence } from "./utils/geo";
import { storage } from "./storage";
import { AuthService } from "./services/authService";

/** Geofence toggle (production default = on) */
const ENFORCE_GEOFENCE =
  process.env.ENFORCE_GEOFENCE !== undefined
    ? process.env.ENFORCE_GEOFENCE === "true"
    : process.env.NODE_ENV === "production";

const router = Router();

/* ============== HEALTH ============== */
router.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ============== AUTH ============== */
/** email/password OR pin+storeId (with optional geofence check) */
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password, pin, storeId, rememberMe, latitude, longitude } = req.body ?? {};
    let user: any;

    if (email && password) {
      try {
        user = await AuthService.authenticateWithEmail(String(email), String(password));
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
        if (msg.includes("invalid password")) return res.status(401).json({ message: "Incorrect password. Please try again." });
        return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
      }
    } else if (pin && storeId) {
      const store = await storage.getStore(Number(storeId));
      if (!store) return res.status(404).json({ message: "Store not found." });

      const hasFence =
        store.latitude != null && store.longitude != null &&
        store.geofenceRadius != null && Number(store.geofenceRadius) > 0;

      if (hasFence && ENFORCE_GEOFENCE) {
        const lat = Number(latitude), lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return res.status(400).json({ message: "Location required for store login. Please enable location services and try again." });
        }
        const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
        if (!ok) return res.status(403).json({ message: "Outside store geofence. Please log in inside the store radius." });
      }

      try {
        user = await AuthService.authenticateWithPin(String(pin), Number(storeId));
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("incorrect pin")) return res.status(401).json({ message: "Incorrect PIN. Please try again." });
        if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
        return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
      }
    } else {
      return res.status(400).json({ message: "Please provide valid login details." });
    }

    (req.session as any).userId = user.id;
    (req.session as any).role = user.role;
    if (rememberMe === true) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

    return res.json({
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, storeId: user.storeId,
    });
  } catch {
    return res.status(500).json({ message: "Unexpected error during login. Please try again." });
  }
});

router.get("/auth/me", authenticateToken, (req, res) => res.json((req as any).user));

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

/** QR – simple JSON payload {storeId} */
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

/** Check-in (captures geofence snapshot in session) */
router.post("/auth/checkin", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

  const { storeId, latitude, longitude } = req.body ?? {};
  if (!storeId) return res.status(400).json({ message: "storeId required" });

  const store = await storage.getStore(Number(storeId));
  if (!store) return res.status(404).json({ message: "Store not found" });

  if (store.latitude != null && store.longitude != null && store.geofenceRadius) {
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Location required for geofenced check-in" });
    }
    const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
    if (!ok) return res.status(403).json({ message: "Outside store geofence" });
  }

  const snapshotFence =
    store.latitude != null && store.longitude != null && store.geofenceRadius
      ? { lat: Number(store.latitude), lng: Number(store.longitude), radiusM: Number(store.geofenceRadius) }
      : undefined;

  (req as any).session.activeCheckin = {
    storeId: Number(storeId),
    storeName: store.name,
    fence: snapshotFence,
    startedAt: new Date().toISOString(),
  };
  if ((storage as any).setActiveCheckin) (storage as any).setActiveCheckin(user.id, (req as any).session.activeCheckin);
  res.json({ success: true });
});

router.post("/auth/checkout", authenticateToken, async (req, res) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });
  (req as any).session.activeCheckin = undefined;
  if ((storage as any).clearActiveCheckin) (storage as any).clearActiveCheckin(user.id);
  res.json({ success: true });
});

/* ============== USERS ============== */
router.get("/users", authenticateToken, async (req, res) => {
  try {
    const me = (req as any).user!;
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const isAdmin = me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN;

    const includeMe = async (arr: any[]) => {
      const meFull = await storage.getUser(me.id);
      if (meFull && !arr.find((u) => u.id === meFull.id)) arr.push(meFull);
    };

    if (isAdmin) {
      if (qStoreId) {
        let list: any[] = [];
        if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(qStoreId);
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
          for (const u of list || []) if (!out.find((x) => x.id === u.id)) out.push(u);
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
      if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(me.storeId);
      await includeMe(list);
      return res.json(list || []);
    }

    const self = await storage.getUser(me.id);
    return res.json(self ? [self] : []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch users" });
  }
});

router.post(
  "/users",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const created = await AuthService.createUser(req.body as any, req.body?.password);
      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to create user" });
    }
  }
);

router.put(
  "/users/:id/pin",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pin: string = String(req.body?.pin ?? "");
      if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: "PIN must be exactly 4 digits" });

      const me = (req as any).user;
      if (me.role === roleEnum.STORE_MANAGER) {
        const target = await storage.getUser(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        if (target.storeId !== me.storeId) return res.status(403).json({ message: "Forbidden" });
      }
      await AuthService.setUserPin(id, pin);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to set PIN" });
    }
  }
);

/* ============== TASK LISTS & TEMPLATES ============== */
// Lists
router.get("/task-lists", authenticateToken, async (_req, res) => {
  try {
    const lists = await storage.getTaskLists();
    res.json(lists || []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch task lists" });
  }
});

router.get("/task-lists/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await storage.getTaskList(id);
    if (!row) return res.status(404).json({ message: "Task list not found" });
    return res.json(row);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch task list" });
  }
});

router.post(
  "/task-lists",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
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
      res.status(201).json(list);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to create task list" });
    }
  }
);

router.put(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
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

router.delete(
  "/task-lists/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
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

// Templates for a list
router.get("/task-lists/:id/templates", authenticateToken, async (req, res) => {
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

// NEW: bulk create templates (subtasks) with per-subtask photo limits
router.post(
  "/task-lists/:id/templates/bulk",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const listId = Number(req.params.id);
      const me = (req as any).user!;
      const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) return res.status(400).json({ message: "items[] required" });

      const created: any[] = [];
      for (const it of items) {
        const row = await storage.createTaskTemplate({
          listId,
          title: String(it.title || "Task"),
          description: it.description ?? null,
          storeId: null,
          createdBy: me.id,
          recurrenceType: null,
          recurrencePattern: null,
          estimatedDuration: null,
          assigneeType: it.assigneeId ? "specific_employee" : "store_wide",
          assigneeId: it.assigneeId ?? null,
          photoRequired: !!it.photoRequired || Number(it.photoCount ?? 0) > 0,
          photoCount: Number(it.photoCount ?? 0),
          priority: it.priority ?? "normal",
          isActive: true,
        });
        created.push(row);
      }
      res.status(201).json({ success: true, count: created.length, items: created });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create templates" });
    }
  }
);

// ---- IMPORT: create list(s) + templates in one call (supports two payload shapes) ----
router.post(
  "/task-lists/import",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const me = (req as any).user!;
      const body = req.body ?? {};

      // Utilities that use your existing storage API (kept consistent with other routes)
      async function createList(input: {
        name: string;
        description?: string | null;
        assigneeType?: "store_wide" | "manager" | "specific_employee";
        assigneeId?: number | null;
        recurrenceType?: "none" | "daily" | "weekly" | "monthly" | null;
        recurrencePattern?: string | null;
        storeId?: number | undefined;
      }) {
        return storage.createTaskList({
          name: input.name,
          description: input.description ?? null,
          assigneeType: input.assigneeType ?? "store_wide",
          assigneeId: input.assigneeId ?? null,
          recurrenceType: input.recurrenceType ?? null,
          recurrencePattern: input.recurrencePattern ?? null,
          createdBy: me.id,
          // Managers can only create for their own store; Admins may leave undefined
          storeId:
            me.role === roleEnum.STORE_MANAGER
              ? Number(me.storeId)
              : input.storeId != null
              ? Number(input.storeId)
              : undefined,
        });
      }

      async function createTemplate(listId: number, it: any, sortOrder?: number) {
        const photoRequired = !!it.photoRequired || Number(it.photoCount ?? 0) > 0;
        const photoCount = photoRequired ? Math.max(1, Math.min(10, Number(it.photoCount ?? 1))) : 0;

        return storage.createTaskTemplate({
          listId,
          title: String(it.title || "Task"),
          description: it.description ?? null,
          storeId: null,
          createdBy: me.id,
          recurrenceType: null,
          recurrencePattern: null,
          estimatedDuration: null,
          assigneeType: it.assigneeId ? "specific_employee" : "store_wide",
          assigneeId: it.assigneeId ?? null,
          photoRequired,
          photoCount,
          priority: it.priority ?? "normal",
          isActive: true,
          sortOrder, // storage may ignore this if not supported
        } as any);
      }

      // Shape A: { sections: [...] }
      if (Array.isArray(body.sections)) {
        const {
          assigneeType = "store_wide",
          assigneeId = null,
          recurrenceType = "none",
          recurrencePattern = null,
          description,
          defaultPhotoRequired = false,
          defaultPhotoCount = 1,
          storeId,
        } = body;

        const lists: Array<{ id: number }> = [];

        for (const section of body.sections) {
          const items = Array.isArray(section.items) ? section.items : [];
          const listDesc =
            typeof description === "string" && description.trim()
              ? description.trim()
              : items.length
              ? items.map((i: any) => String(i.title || "").trim()).filter(Boolean).join(" • ")
              : null;

          const list = await createList({
            name: String(section.title || "Untitled").trim(),
            description: listDesc,
            assigneeType,
            assigneeId: assigneeId != null ? Number(assigneeId) : null,
            recurrenceType: recurrenceType ?? "none",
            recurrencePattern: recurrencePattern ?? null,
            storeId: storeId != null ? Number(storeId) : undefined,
          });

          for (let i = 0; i < items.length; i++) {
            const raw = items[i] ?? {};
            const normalized = {
              title: raw.title,
              description: raw.description ?? null,
              assigneeId: typeof raw.assigneeId === "number" ? raw.assigneeId : null,
              photoRequired:
                raw.photoRequired != null ? !!raw.photoRequired : !!defaultPhotoRequired,
              photoCount:
                raw.photoRequired != null || defaultPhotoRequired
                  ? Math.max(
                      1,
                      Math.min(10, Number(raw.photoCount ?? defaultPhotoCount ?? 1))
                    )
                  : 0,
              priority: raw.priority ?? "normal",
            };
            await createTemplate(list.id, normalized, i);
          }

          lists.push({ id: list.id });
        }

        return res.json({ ok: true, created: lists.length, lists });
      }

      // Shape B (legacy): { list:{...}, templates:[...] }
      if (body.list && Array.isArray(body.templates)) {
        const l = body.list;
        const list = await createList({
          name: String(l.name ?? l.title ?? "Untitled"),
          description: l.description ?? null,
          assigneeType: l.assigneeType ?? "store_wide",
          assigneeId: l.assigneeId != null ? Number(l.assigneeId) : null,
          recurrenceType: l.recurrenceType ?? "none",
          recurrencePattern: l.recurrencePattern ?? null,
          storeId:
            body.assignToMyStore === true && me.role === roleEnum.STORE_MANAGER
              ? Number(me.storeId)
              : l.storeId != null
              ? Number(l.storeId)
              : undefined,
        });

        for (let i = 0; i < body.templates.length; i++) {
          const t = body.templates[i] ?? {};
          await createTemplate(list.id, t, i);
        }

        return res.json({ success: true, listId: list.id, lists: [{ id: list.id }] });
      }

      return res.status(400).json({ message: "Invalid import payload" });
    } catch (err: any) {
      console.error("task-lists/import error:", err);
      return res.status(500).json({ message: err?.message || "Import failed" });
    }
  }
);

// Create one template
router.post(
  "/task-lists/:id/templates",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
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

// Update one template
router.put(
  "/task-lists/templates/:templateId",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
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

// Delete template
/*
router.delete(
  "/task-lists/templates/:templateId",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const id = Number(req.params.templateId);
      await storage.deleteTaskTemplate(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to delete template" });
    }
  }
);*/

/* ============== TASK LIST RUN / TODAY / ENSURE ============== */
router.post(
  "/task-lists/:id/run",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
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

      if (me.role === roleEnum.STORE_MANAGER && (!targetStoreId || targetStoreId !== me.storeId)) {
        return res.status(403).json({ message: "Unauthorized store" });
      }
      if (!targetStoreId) return res.status(400).json({ message: "storeId required" });

      let templates: any[] = [];
      if (typeof (storage as any).getTemplatesByList === "function") {
        templates = await (storage as any).getTemplatesByList(listId);
      } else {
        const all = await storage.getTaskTemplates();
        templates = (all || []).filter((t: any) => t.listId === listId && t.isActive !== false);
      }

      const createdTasks: any[] = [];
      for (const t of templates) {
        const newTask = await storage.createTask({
          templateId: t.id,
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

// Ensure today's task exists for a given template
router.post("/task-lists/:id/ensure-task", authenticateToken, async (req, res) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const templateId = Number(req.body?.templateId);
    if (!templateId) return res.status(400).json({ message: "templateId required" });

    const list = await storage.getTaskList(listId);
    if (!list) return res.status(404).json({ message: "Task list not found" });

    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const targetStoreId =
      (me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN) && qStoreId ? qStoreId : me.storeId;
    if (!targetStoreId) return res.status(400).json({ message: "storeId required" });

    let template: any | undefined;
    if (typeof (storage as any).getTaskTemplate === "function") {
      template = await (storage as any).getTaskTemplate(templateId);
    } else {
      const all = await storage.getTaskTemplates();
      template = (all || []).find((t: any) => t.id === templateId);
    }
    if (!template || template.listId !== listId) return res.status(404).json({ message: "Template not found in this list" });

    const allTasks = await storage.getTasks({ storeId: targetStoreId });
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

    res.status(201).json(newTask);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to ensure task" });
  }
});

// Today's tasks for a list+store (supports ensure=1 to auto-create today's tasks)
router.get("/task-lists/:id/tasks", authenticateToken, async (req, res) => {
  try {
    const me = (req as any).user!;
    const listId = Number(req.params.id);
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : me.storeId;
    if (!qStoreId) return res.status(400).json({ message: "storeId required" });

    const dateStr = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const ensure = String(req.query.ensure || "") === "1";

    const allTemplates = await storage.getTaskTemplates();
    const templates = (allTemplates || []).filter(
      (t: any) => t.listId === listId && t.isActive !== false
    );
    const templateIds = templates.map((t: any) => t.id);

    const allTasks = await storage.getTasks({ storeId: qStoreId });
    let byList = (allTasks || []).filter((t: any) => {
      if (!t.templateId || !templateIds.includes(t.templateId)) return false;
      const d = t.scheduledFor ? new Date(t.scheduledFor) : null;
      const dStr = d ? d.toISOString().slice(0, 10) : "";
      return dStr === dateStr;
    });

    // Ensure mode: create today's tasks from templates if none exist
    if (ensure && byList.length === 0 && templates.length > 0) {
      const created: any[] = [];
      for (const t of templates) {
        const newTask = await storage.createTask({
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
        created.push(newTask);
      }
      byList = created;
    }

    res.json(byList);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch tasks for list" });
  }
});

/* ============== TASKS LISTING/CRUD ============== */
router.get("/tasks/my", authenticateToken, async (req, res) => {
  const user = (req as any).user!;
  const rows = await storage.getTasks({ assigneeId: user.id });
  res.json(rows);
});

router.get("/tasks/available", authenticateToken, async (req, res) => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  if (!storeId) return res.status(400).json({ message: "storeId required" });
  const rows = await storage.getTasks({ storeId, status: taskStatusEnum.AVAILABLE });
  res.json(rows);
});

router.get("/tasks", authenticateToken, async (req, res) => {
  const user = (req as any).user!;
  if (user.role === roleEnum.EMPLOYEE) {
    const mine = await storage.getTasks({ assigneeId: user.id });
    return res.json(mine);
  }
  if (user.role === roleEnum.STORE_MANAGER) {
    if (!user.storeId) return res.status(400).json({ message: "Store assignment required" });
    const rows = await storage.getTasks({ storeId: user.storeId });
    return res.json(rows);
  }
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  const rows = await storage.getTasks({ storeId });
  return res.json(rows);
});

router.post(
  "/tasks",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    const user = (req as any).user!;
    const b = req.body ?? {};
    if (!b.title || !b.storeId) return res.status(400).json({ message: "title and storeId are required" });
    if (user.role === roleEnum.STORE_MANAGER && user.storeId !== Number(b.storeId)) {
      return res.status(403).json({ message: "Cannot create tasks for another store" });
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
      estimatedDuration: b.estimatedDuration != null ? Number(b.estimatedDuration) : null,
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
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    const user = (req as any).user!;
    const id = Number(req.params.id);
    const patch = req.body ?? {};

    if (user.role === roleEnum.STORE_MANAGER) {
      const t = await storage.getTask(id);
      if (t && t.storeId !== user.storeId) return res.status(403).json({ message: "Forbidden" });
    }

    const updates: any = {};
    if ("title" in patch) updates.title = patch.title ?? null;
    if ("description" in patch) updates.description = patch.description ?? null;
    if ("priority" in patch) updates.priority = patch.priority ?? "normal";
    if ("assigneeId" in patch) {
      updates.assigneeId = patch.assigneeId != null ? Number(patch.assigneeId) : null;
      updates.assigneeType = patch.assigneeId ? "specific_employee" : "store_wide";
    }
    if ("status" in patch) updates.status = patch.status ?? taskStatusEnum.PENDING;
    if ("dueAt" in patch) updates.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    if ("scheduledFor" in patch) updates.scheduledFor = patch.scheduledFor ? new Date(patch.scheduledFor) : null;
    if ("estimatedDuration" in patch) {
      updates.estimatedDuration = patch.estimatedDuration != null ? Number(patch.estimatedDuration) : null;
    }
    if ("photoRequired" in patch) updates.photoRequired = !!patch.photoRequired;
    if ("photoCount" in patch) updates.photoCount = Number(patch.photoCount) || 1;
    if ("geoLat" in patch) updates.geoLat = patch.geoLat != null ? String(patch.geoLat) : null;
    if ("geoLng" in patch) updates.geoLng = patch.geoLng != null ? String(patch.geoLng) : null;
    if ("geoRadiusM" in patch) updates.geoRadiusM = patch.geoRadiusM != null ? Number(patch.geoRadiusM) : null;
    if ("notes" in patch) updates.notes = patch.notes ?? null;

    const updated = await storage.updateTask(id, updates);
    res.json(updated);
  }
);

router.delete(
  "/tasks/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    const user = (req as any).user!;
    const id = Number(req.params.id);
    if (user.role === roleEnum.STORE_MANAGER) {
      const t = await storage.getTask(id);
      if (t && t.storeId !== user.storeId) return res.status(403).json({ message: "Forbidden" });
    }
    await storage.deleteTask(id);
    res.json({ success: true });
  }
);

/* ============== PHOTOS & COMPLETE ============== */
router.post(
  "/tasks/:id/photos",
  authenticateToken,
  requireActiveCheckin, // enforce geofence when enabled
  upload.single("photo"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user!;
      const lat = req.body?.latitude != null ? Number(req.body.latitude) : undefined;
      const lng = req.body?.longitude != null ? Number(req.body.longitude) : undefined;
      const point = lat != null && lng != null ? { lat, lng } : undefined;

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      // Enforce photo limit
      const need = Number(task.photoCount ?? 0);
      const have = Number(task.photosUploaded ?? 0);
      if (need > 0 && have >= need) {
        return res.status(400).json({ message: "Photo limit reached for this task." });
      }

      // Assignee rule for employees
      if (user.role === roleEnum.EMPLOYEE && task.assigneeId && task.assigneeId !== user.id) {
        return res.status(403).json({ message: "You can only upload for your assigned task" });
      }

      // Geofence check from active check-in snapshot
      const activeCheckin = (req as any).activeCheckin as { fence?: { lat: number; lng: number; radiusM: number } };
      const taskFence = activeCheckin?.fence;
      if (taskFence) {
        if (!point || !withinFence(point, { lat: taskFence.lat, lng: taskFence.lng }, taskFence.radiusM)) {
          return res.status(403).json({ message: "You must be on store premises to upload photos." });
        }
      }

      const f = req.file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No photo uploaded" });

      const url = `/uploads/${f.filename}`;
      await storage.createTaskPhoto({
        taskId: id,
        taskItemId: req.body?.taskItemId ? Number(req.body.taskItemId) : undefined,
        url,
        filename: f.originalname || f.filename,
        mimeType: f.mimetype,
        fileSize: f.size,
        latitude: lat,
        longitude: lng,
        uploadedBy: user.id,
      });

      const newCount = have + 1;
      await storage.updateTask(id, { photosUploaded: newCount });
      res.json({ success: true, photoUrl: url, photosUploaded: newCount, photoCount: need });
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
      const { latitude, longitude, overridePhotoRequirement, notes } = req.body ?? {};
      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (user.role === roleEnum.EMPLOYEE) {
        if (task.assigneeId && task.assigneeId !== user.id) return res.status(403).json({ message: "Not your task" });
        const need = task.photoCount ?? 1;
        const have = task.photosUploaded ?? 0;
        if (task.photoRequired && have < need && !overridePhotoRequirement) {
          return res.status(400).json({ message: "Photo required before completion" });
        }
      }

      const point =
        typeof latitude === "number" && typeof longitude === "number"
          ? { lat: Number(latitude), lng: Number(longitude) }
          : undefined;

      const activeCheckin = (req as any).activeCheckin as { fence?: { lat: number; lng: number; radiusM: number } };
      const taskFence = activeCheckin?.fence;
      if (taskFence) {
        if (!point || !withinFence(point, { lat: taskFence.lat, lng: taskFence.lng }, taskFence.radiusM)) {
          return res.status(403).json({ message: "Completion must occur on store premises." });
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

/* ============== STORES ============== */
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

router.get("/stores/:id", authenticateToken, async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;
    if (user.role !== "master_admin" && user.role !== "admin" && user.storeId !== storeId) {
      return res.status(403).json({ message: "Unauthorized to view this store" });
    }
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch store" });
  }
});

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
      res.status(500).json({ message: err?.message || "Failed to create store" });
    }
  }
);

router.put(
  "/stores/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      const updates = req.body;
      const updatedStore = await storage.updateStore(storeId, updates);
      if (!updatedStore) return res.status(404).json({ message: "Store not found" });
      res.json(updatedStore);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update store" });
    }
  }
);

router.get("/stores/:id/stats", authenticateToken, async (req, res) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;
    if (user.role !== "master_admin" && user.role !== "admin" && user.storeId !== storeId) {
      return res.status(403).json({ message: "Unauthorized to view store stats" });
    }

    const tasks = await storage.getTasks({ storeId });
    const taskStats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t: any) => t.status === "completed").length,
      pendingTasks: tasks.filter((t: any) => t.status === "pending").length,
      inProgressTasks: tasks.filter((t: any) => t.status === "in_progress").length,
    };

    let users: any[] = [];
    if (typeof (storage as any).getUsersByStore === "function") {
      users = await (storage as any).getUsersByStore(storeId);
    } else {
      const ids = new Set<number>();
      for (const t of tasks) [t.assigneeId, t.claimedBy, t.completedBy].forEach((id: any) => { if (typeof id === "number") ids.add(id); });
      users = (await Promise.all(Array.from(ids).map((id) => storage.getUser(id)))).filter(Boolean) as any[];
    }
    const userStats = { totalEmployees: users.length, activeEmployees: users.filter((u: any) => u?.isActive).length };

    res.json({ ...taskStats, ...userStats });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch store stats" });
  }
});

router.post(
  "/stores/:id/generate-qr",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const storeId = Number(req.params.id);
      const user = (req as any).user;
      if (user.role === roleEnum.STORE_MANAGER && user.storeId !== storeId) {
        return res.status(403).json({ message: "Unauthorized to generate QR for this store" });
      }
      const store = await storage.getStore(storeId);
      if (!store) return res.status(404).json({ message: "Store not found" });

      const qrData = JSON.stringify({ storeId, timestamp: Date.now() });
      const qrCode = `data:image/svg+xml;base64,${Buffer.from(qrData).toString("base64")}`;
      res.json({ qrCode });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to generate QR code" });
    }
  }
);

export default router;
