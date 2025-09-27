// server/routes/tasks.ts
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

/* ============== Helpers ============== */

type UserLike = {
  id: number;
  role: string;
  storeId?: number | null;
  firstName?: string | null;
};

const isAdmin = (u: UserLike) =>
  u.role === roleEnum.MASTER_ADMIN || u.role === roleEnum.ADMIN;

const isManager = (u: UserLike) => u.role === roleEnum.STORE_MANAGER;
const isEmployee = (u: UserLike) => u.role === roleEnum.EMPLOYEE;

function canTouchTask(task: any, user: UserLike): boolean {
  if (isAdmin(user)) return true;
  if (isManager(user)) {
    if (!user.storeId) return false;
    return Number(task.storeId) === Number(user.storeId);
  }
  if (isEmployee(user)) {
    if (!user.storeId) return false;
    if (Number(task.storeId) !== Number(user.storeId)) return false;
    if (task.assigneeId) {
      return Number(task.assigneeId) === Number(user.id);
    }
    return true;
  }
  return false;
}

function nextPhotoLimit(task: any): { needed: number; have: number; allowed: boolean } {
  const need = Math.max(0, Number(task.photoCount ?? (task.photoRequired ? 1 : 0)));
  const have = Math.max(0, Number(task.photosUploaded ?? 0));
  return { needed: need, have, allowed: have < need || need === 0 };
}

const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const isToday = (v?: string | Date | null) => {
  if (!v) return false;
  const d = v instanceof Date ? v : new Date(v);
  return toYMD(d) === toYMD(new Date());
};

/**
 * Attach `completedByName` to each task that has `completedBy`.
 */
async function attachCompletedNames(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;

  const ids = Array.from(
    new Set(
      rows
        .map((t) => (t?.completedBy != null ? Number(t.completedBy) : null))
        .filter((v): v is number => Number.isFinite(v))
    )
  );

  const usersById = new Map<number, { firstName?: string | null; lastName?: string | null }>();
  for (const id of ids) {
    try {
      const u = await storage.getUser(id);
      if (u) usersById.set(id, { firstName: u.firstName ?? null, lastName: u.lastName ?? null });
    } catch {}
  }

  return rows.map((t) => {
    if (t?.completedBy != null) {
      const u = usersById.get(Number(t.completedBy));
      const name =
        u && (u.firstName || u.lastName)
          ? [u.firstName, u.lastName].filter(Boolean).join(" ")
          : `User #${t.completedBy}`;
      return { ...t, completedByName: name };
    }
    return t;
  });
}

/* ============== TASKS LISTING/CRUD ============== */

r.get("/tasks/my", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user!;
  const todayOnly = String(req.query.todayOnly || "").toLowerCase() === "true";

  if (!user.storeId) {
    let direct = await storage.getTasks({ assigneeId: user.id });
    if (todayOnly) direct = (direct || []).filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
    return res.json(await attachCompletedNames(direct || []));
  }

  const direct = await storage.getTasks({ assigneeId: user.id });
  const storeWide = await storage.getTasks({
    storeId: user.storeId,
    assigneeType: "store_wide",
    assigneeId: null,
  } as any);

  const seen = new Set<number>();
  let merged = [...(direct || []), ...(storeWide || [])].filter((t: any) => {
    const id = Number(t.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (todayOnly) {
    merged = merged.filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
  }

  res.json(await attachCompletedNames(merged || []));
});

r.get("/tasks/available", authenticateToken, async (req: Request, res: Response) => {
  const me = (req as any).user!;
  const qStoreId = req.query.storeId ? Number(req.query.storeId) : (me.storeId ?? undefined);
  const todayOnly = String(req.query.todayOnly || "").toLowerCase() === "true";
  if (!qStoreId) return res.status(400).json({ message: "storeId required" });

  let rows = await storage.getTasks({ storeId: qStoreId, status: taskStatusEnum.AVAILABLE });
  if (todayOnly) rows = (rows || []).filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
  res.json(rows || []);
});

r.get("/tasks", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user!;
  const todayOnly = String(req.query.todayOnly || "").toLowerCase() === "true";

  if (user.role === roleEnum.EMPLOYEE) {
    let mine = await storage.getTasks({ assigneeId: user.id });
    if (todayOnly) mine = (mine || []).filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
    return res.json(await attachCompletedNames(mine || []));
  }

  if (user.role === roleEnum.STORE_MANAGER) {
    if (!user.storeId) return res.status(400).json({ message: "Store assignment required" });
    let rows = await storage.getTasks({ storeId: user.storeId });
    if (todayOnly) rows = (rows || []).filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
    return res.json(await attachCompletedNames(rows || []));
  }

  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  let rows = await storage.getTasks({ storeId });
  if (todayOnly) rows = (rows || []).filter((t: any) => isToday(t.scheduledFor || t.dueAt || t.createdAt));
  return res.json(await attachCompletedNames(rows || []));
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

// Upload photo (in-DB data URL) with geofence + permission
r.post(
  "/tasks/:id/photos",
  authenticateToken,
  requireActiveCheckin,
  upload.single("photo"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user!;
      const lat = req.body?.latitude != null ? Number(req.body.latitude) : undefined;
      const lng = req.body?.longitude != null ? Number(req.body.longitude) : undefined;

      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (user.role === roleEnum.EMPLOYEE && task.assigneeId && task.assigneeId !== user.id) {
        return res.status(403).json({ message: "Not your task" });
      }
      if (user.role === roleEnum.STORE_MANAGER && user.storeId && task.storeId !== user.storeId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requiredMax = Number(task.photoCount ?? 0);
      const have = Number(task.photosUploaded ?? 0);
      if (requiredMax > 0 && have >= requiredMax) {
        return res.status(400).json({ message: `Upload limit reached (${requiredMax}).` });
      }

      const f = req.file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No photo uploaded" });
      if (!f.mimetype?.startsWith("image/")) {
        return res.status(415).json({ message: "Only image files are allowed" });
      }

      const active = (req as any).activeCheckin as
        | { fence?: { lat: number; lng: number; radiusM: number } }
        | undefined;

      const fence = active?.fence;
      const point =
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat: Number(lat), lng: Number(lng) } : undefined;

      if (fence) {
        const ok = point && withinFence(point, { lat: fence.lat, lng: fence.lng }, fence.radiusM);
        if (!ok) {
          return res.status(403).json({ message: "You must be on store premises to upload photos." });
        }
      }

      const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;

      const inserted = await db
        .insert(taskPhotos)
        .values({
          taskId: id,
          taskItemId: req.body?.taskItemId ? Number(req.body.taskItemId) : null,
          url: dataUrl,
          filename: f.originalname || "upload",
          mimeType: f.mimetype,
          fileSize: f.size,
          latitude: lat ?? null,
          longitude: lng ?? null,
          uploadedBy: user.id,
          uploadedByName: (user.firstName ?? null) as any,
          uploadedByRole: (user.role ?? null) as any,
        } as any)
        .returning({ id: taskPhotos.id });

      const newCount = requiredMax > 0 ? Math.min(have + 1, requiredMax) : have + 1;
      await storage.updateTask(id, { photosUploaded: newCount });

      res.json({ success: true, photoId: inserted?.[0]?.id, photosUploaded: newCount, required: requiredMax });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ message: err?.message || "Upload failed" });
    }
  }
);

r.post(
  "/tasks/:id/complete",
  authenticateToken,
  requireActiveCheckin,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = (req as any).user as UserLike;
      const { latitude, longitude, overridePhotoRequirement, notes } = req.body ?? {};
      const task = await storage.getTask(id);
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (!canTouchTask(task, user)) return res.status(403).json({ message: "Forbidden" });

      if (isEmployee(user)) {
        const need = Math.max(0, Number(task.photoCount ?? (task.photoRequired ? 1 : 0)));
        const have = Math.max(0, Number(task.photosUploaded ?? 0));
        if (task.photoRequired && have < need && !overridePhotoRequirement) {
          return res.status(400).json({ message: "Photo required before completion" });
        }
      }

      const point =
        typeof latitude === "number" && typeof longitude === "number"
          ? { lat: Number(latitude), lng: Number(longitude) }
          : undefined;

      const active = (req as any).activeCheckin as
        | { fence?: { lat: number; lng: number; radiusM: number } }
        | undefined;
      const fence = active?.fence;

      const within = fence
        ? point && withinFence(point, { lat: fence.lat, lng: fence.lng }, fence.radiusM)
        : true;

      if (fence && !within) {
        return res.status(403).json({ message: "Completion must occur on store premises." });
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

/* ============== Serve photo bytes from stored data:URL ============== */

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
