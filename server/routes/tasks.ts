import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { requireActiveCheckin } from "../middleware/requireCheckin";
import { upload } from "../middleware/upload";
import { storage } from "../storage";
import { withinFence } from "../utils/geo";
import { db } from "../db";
import { roleEnum, taskStatusEnum, taskPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";

const r = Router();

/* ============== TASKS LISTING/CRUD ============== */
r.get("/tasks/my", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user!;
  const rows = await storage.getTasks({ assigneeId: user.id });
  res.json(rows);
});

r.get("/tasks/available", authenticateToken, async (req: Request, res: Response) => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  if (!storeId) return res.status(400).json({ message: "storeId required" });
  const rows = await storage.getTasks({ storeId, status: taskStatusEnum.AVAILABLE });
  res.json(rows);
});

r.get("/tasks", authenticateToken, async (req: Request, res: Response) => {
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

r.post(
  "/tasks",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
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

r.put(
  "/tasks/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
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

r.delete(
  "/tasks/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
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
// Store photo as data:URL in DB (no disk writes)
r.post("/tasks/:id/photos",
  authenticateToken,
  requireActiveCheckin,
  upload.single("photo"),
  async (req, res) => {
    const id = Number(req.params.id);
    const user = (req as any).user!;
    const lat = req.body?.latitude != null ? Number(req.body.latitude) : undefined;
    const lng = req.body?.longitude != null ? Number(req.body.longitude) : undefined;

    const task = await storage.getTask(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // photo limits, ownership, geofence checks (keep your existing checks)

    const f = req.file as Express.Multer.File | undefined;
    if (!f) return res.status(400).json({ message: "No photo uploaded" });

    // store as data URL in DB (no disk)
    const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;

    // insert in DB
    const { db } = await import("../db");
    const { taskPhotos } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    await db.insert(taskPhotos).values({
      taskId: id,
      taskItemId: req.body?.taskItemId ? Number(req.body.taskItemId) : null,
      url: dataUrl, // <— this is what frontend will render
      filename: f.originalname || "upload",
      mimeType: f.mimetype,
      fileSize: f.size,
      latitude: lat ?? null,
      longitude: lng ?? null,
      uploadedBy: user.id,
      uploadedByName: (user.firstName ?? null) as any,
      uploadedByRole: (user.role ?? null) as any,
    } as any);

    await storage.updateTask(id, { photosUploaded: (task.photosUploaded ?? 0) + 1 });

    res.json({ success: true });
  }
);


r.post(
  "/tasks/:id/complete",
  authenticateToken,
  requireActiveCheckin,
  async (req: Request, res: Response) => {
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

// Serve photo bytes from stored data:URL
r.get("/photos/:id", authenticateToken, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const rows = await db
    .select({ url: taskPhotos.url })
    .from(taskPhotos)
    .where(eq(taskPhotos.id, id))
    .limit(1);

  const dataUrl = rows?.[0]?.url || "";
  if (!dataUrl.startsWith("data:")) return res.status(404).json({ message: "Not found" });

  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return res.status(500).json({ message: "Invalid image data" });

  const mime = m[1];
  const b64 = m[2];
  res.setHeader("Content-Type", mime || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(b64, "base64"));
});

export default r;