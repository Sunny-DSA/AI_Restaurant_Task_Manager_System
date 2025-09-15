// server/uploads.ts
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { upload } from "../middleware/upload";   // 👈 memoryStorage version you already have
import { db } from "../db";
import { taskPhotos } from "@shared/schema";     // 👈 use your alias, not a relative path
import { eq } from "drizzle-orm";

const r = Router();

/**
 * POST /api/photos
 * Body (multipart/form-data):
 *   - photo: File
 *   - taskId: number (required)
 *   - taskItemId?: number
 *   - latitude?: number
 *   - longitude?: number
 */
r.post("/photos", authenticateToken, upload.single("photo"), async (req, res) => {
  try {
    const user = (req as any).user as { id: number; firstName?: string; role: string };
    if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

    if (!req.file) return res.status(400).json({ message: "Missing file" });

    const taskId = Number((req.body as any)?.taskId);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: "taskId required" });

    const taskItemIdRaw = (req.body as any)?.taskItemId;
    const taskItemId = taskItemIdRaw != null ? Number(taskItemIdRaw) : null;

    const latRaw = (req.body as any)?.latitude;
    const lngRaw = (req.body as any)?.longitude;
    const latitude = latRaw != null ? Number(latRaw) : null;
    const longitude = lngRaw != null ? Number(lngRaw) : null;

    const f = req.file;

    const [row] = await db
      .insert(taskPhotos)
      .values({
        taskId,
        taskItemId,
        filename: f.originalname || "upload.jpg",
        mimeType: f.mimetype,
        fileSize: f.size,
        data: f.buffer, // bytes into Postgres
        latitude,
        longitude,
        uploadedBy: user.id,
        uploadedByName: user.firstName ?? null,
        uploadedByRole: user.role,
        url: null, // legacy field is null now
      } as any) // 👈 cast once to bypass stale TS table shape during migration
      .returning({ id: taskPhotos.id });

    return res.json({ id: row?.id });
  } catch (e: any) {
    console.error("Upload failed:", e);
    return res.status(500).json({ message: e?.message || "Upload failed" });
  }
});

export default r;
