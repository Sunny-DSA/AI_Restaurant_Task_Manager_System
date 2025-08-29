// server/routes.ts
import { Router, Request, Response } from "express";
import { roleEnum, taskStatusEnum } from "@shared/schema";
import { authenticateToken, requireRole } from "./middleware/auth";
import { requireActiveCheckin } from "./middleware/requireCheckin";
import { upload } from "./middleware/upload";
import { withinFence } from "./utils/geo";
import { storage } from "./storage";
import { AuthService } from "./services/authService";

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
 * - Admin/manager: { email, password }
 * - Store login:   { storeId, pin }
 * Sets req.session.userId on success and returns a minimal user payload.
 */
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password, storeId, pin } = req.body ?? {};

    let user:
      | {
          id: number;
          email?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          role: string;
          storeId?: number | null;
          isActive: boolean;
        }
      | null = null;

    if (email && password) {
      user = await AuthService.authenticateWithEmail(String(email), String(password));
    } else if (storeId && pin) {
      user = await AuthService.authenticateWithPin(String(pin), Number(storeId));
    } else {
      return res
        .status(400)
        .json({ message: "Provide either {email,password} or {storeId,pin}" });
    }

    // set session
    (req.session as any).userId = user.id;

    return res.json({
      id: user.id,
      email: user.email ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      role: user.role,
      storeId: user.storeId ?? undefined,
    });
  } catch (err: any) {
    return res.status(401).json({ message: err?.message || "Invalid credentials" });
  }
});

/**
 * GET /api/auth/me
 */
router.get("/auth/me", authenticateToken, (req, res) => {
  return res.json((req as any).user);
});

/**
 * POST /api/auth/logout
 */
router.post("/auth/logout", (req, res) => {
  try {
    req.session?.destroy(() => {
      // match cookie name configured in server/index.ts (name: "sid")
      res.clearCookie("sid");
      res.status(200).json({ ok: true });
    });
  } catch {
    res.clearCookie("sid");
    res.status(200).json({ ok: true });
  }
});

/**
 * POST /api/auth/verify-qr
 * body: { qrData }
 * Accepts simple JSON like: {"storeId":123}
 */
router.post("/auth/verify-qr", async (req, res) => {
  try {
    const { qrData } = req.body ?? {};
    const payload = JSON.parse(String(qrData || "{}"));
    const storeId = Number(payload?.storeId);
    if (!storeId) return res.status(400).json({ message: "Invalid QR" });

    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });

    res.json({ success: true, storeId, storeName: store.name });
  } catch {
    res.status(400).json({ message: "Invalid QR" });
  }
});

/**
 * POST /api/auth/checkin
 * body: { storeId, latitude, longitude }
 */
router.post("/auth/checkin", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

  const { storeId, latitude, longitude } = req.body ?? {};
  if (!storeId) return res.status(400).json({ message: "storeId required" });

  const store = await storage.getStore(Number(storeId));
  if (!store) return res.status(404).json({ message: "Store not found" });

  if (store.latitude != null && store.longitude != null && store.geofenceRadius) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Location required for geofenced check-in" });
    }
    const center = { lat: Number(store.latitude), lng: Number(store.longitude) };
    const ok = withinFence({ lat, lng }, center, Number(store.geofenceRadius));
    if (!ok) return res.status(403).json({ message: "Outside store geofence" });
  }

  const snapshotFence =
    store.latitude != null && store.longitude != null && store.geofenceRadius
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

  // If your storage keeps an in-memory map for active checkins, expose a setter; else ignore:
  if ((storage as any).setActiveCheckin) {
    (storage as any).setActiveCheckin(user.id, (req as any).session.activeCheckin);
  }

  res.json({ success: true });
});

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
   USERS  (no storage.getUsers usage)
========================================= */

/**
 * GET /api/users?storeId=#
 * NOTE: Since your DatabaseStorage lacks getUsers, we derive a list from tasks
 * and always include the current user. This compiles now and is enough for the UI
 * (e.g. transfer dropdown) to have at least some users.
 */
router.get("/users", authenticateToken, async (req, res) => {
  const me = (req as any).user!;
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;

  const resultMap = new Map<number, any>();

  // Always include current user
  const meFull = await storage.getUser(me.id);
  if (meFull) resultMap.set(meFull.id, meFull);

  // If a store is specified, gather users referenced by tasks in that store
  if (storeId) {
    const tasks = await storage.getTasks({ storeId });
    for (const t of tasks) {
      const ids = [t.assigneeId, t.claimedBy, t.completedBy].filter(
        (v): v is number => typeof v === "number"
      );
      for (const uid of ids) {
        if (!resultMap.has(uid)) {
          const u = await storage.getUser(uid);
          if (u) resultMap.set(u.id, u);
        }
      }
    }
  }

  res.json(Array.from(resultMap.values()));
});

/**
 * POST /api/users
 * Creates a user (delegates to AuthService.createUser).
 */
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

/**
 * PUT /api/users/:id/reset-pin
 */
router.put(
  "/users/:id/reset-pin",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const out = await AuthService.resetUserPin(id);
      res.json(out);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Failed to reset PIN" });
    }
  }
);

/* =========================================
   TASKS — LISTING
========================================= */

/**
 * GET /api/tasks/my
 */
router.get("/tasks/my", authenticateToken, async (req, res) => {
  const user = (req as any).user!;
  const rows = await storage.getTasks({ assigneeId: user.id });
  res.json(rows);
});

/**
 * GET /api/tasks/available?storeId=#
 */
router.get("/tasks/available", authenticateToken, async (req, res) => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  if (!storeId) return res.status(400).json({ message: "storeId required" });

  const rows = await storage.getTasks({ storeId, status: taskStatusEnum.AVAILABLE });
  res.json(rows);
});

/**
 * GET /api/tasks
 * Admins: all tasks (optional ?storeId=)
 * Store managers: store tasks
 * Employees: fallback to /tasks/my
 */
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

  // Admin / Master Admin
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
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req, res) => {
    const user = (req as any).user!;
    const b = req.body ?? {};

    if (!b.title || !b.storeId) {
      return res.status(400).json({ message: "title and storeId are required" });
    }

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
      if (t && t.storeId !== user.storeId) {
        return res.status(403).json({ message: "Forbidden" });
      }
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
    if ("scheduledFor" in patch)
      updates.scheduledFor = patch.scheduledFor ? new Date(patch.scheduledFor) : null;
    if ("estimatedDuration" in patch) {
      updates.estimatedDuration =
        patch.estimatedDuration != null ? Number(patch.estimatedDuration) : null;
    }
    if ("photoRequired" in patch) updates.photoRequired = !!patch.photoRequired;
    if ("photoCount" in patch) updates.photoCount = Number(patch.photoCount) || 1;
    if ("geoLat" in patch) updates.geoLat = patch.geoLat != null ? String(patch.geoLat) : null;
    if ("geoLng" in patch) updates.geoLng = patch.geoLng != null ? String(patch.geoLng) : null;
    if ("geoRadiusM" in patch) updates.geoRadiusM =
      patch.geoRadiusM != null ? Number(patch.geoRadiusM) : null;
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

  // Optional geofence check using active check-in
  const fence = (req as any).session?.activeCheckin?.fence as
    | { lat: number; lng: number; radiusM: number }
    | undefined;
  if (fence) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Location required for claim" });
    }
    const ok = withinFence({ lat, lng }, { lat: fence.lat, lng: fence.lng }, fence.radiusM);
    if (!ok) return res.status(403).json({ message: "Outside store geofence" });
  }

  const updated = await storage.claimTask(id, user.id);
  res.json(updated);
});

router.post(
  "/tasks/:id/transfer",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
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

    // ensure target exists
    const target = await storage.getUser(Number(toUserId));
    if (!target) return res.status(404).json({ message: "Target user not found" });

    const updated = await storage.transferTask(id, user.id, Number(toUserId), req.body?.reason);
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
      const lat = req.body?.latitude != null ? Number(req.body.latitude) : undefined;
      const lng = req.body?.longitude != null ? Number(req.body.longitude) : undefined;
      const point = lat != null && lng != null ? { lat, lng } : undefined;

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (user.role === roleEnum.EMPLOYEE && task.assigneeId && task.assigneeId !== user.id) {
        return res.status(403).json({ message: "You can only upload for your assigned task" });
      }

      // Choose fence: task-specific OR activeCheckin snapshot
      const activeCheckin = (req as any).activeCheckin as {
        fence?: { lat: number; lng: number; radiusM: number };
      };
      const taskFence =
        task.geoLat != null && task.geoLng != null && task.geoRadiusM
          ? { lat: Number(task.geoLat), lng: Number(task.geoLng), radiusM: Number(task.geoRadiusM) }
          : activeCheckin?.fence;

      if (taskFence) {
        if (!point || !withinFence(point, { lat: taskFence.lat, lng: taskFence.lng }, taskFence.radiusM)) {
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
        taskItemId: req.body?.taskItemId ? Number(req.body.taskItemId) : undefined,
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
      const { latitude, longitude, overridePhotoRequirement, notes } = req.body ?? {};

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (user.role === roleEnum.EMPLOYEE) {
        if (task.assigneeId && task.assigneeId !== user.id) {
          return res.status(403).json({ message: "Not your task" });
        }
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

      const activeCheckin = (req as any).activeCheckin as {
        fence?: { lat: number; lng: number; radiusM: number };
      };
      const taskFence =
        task.geoLat != null && task.geoLng != null && task.geoRadiusM
          ? { lat: Number(task.geoLat), lng: Number(task.geoLng), radiusM: Number(task.geoRadiusM) }
          : activeCheckin?.fence;

      if (taskFence) {
        if (!point || !withinFence(point, { lat: taskFence.lat, lng: taskFence.lng }, taskFence.radiusM)) {
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

export default router;
