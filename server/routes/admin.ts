import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { taskPhotos, tasks, taskTemplates, taskLists, roleEnum } from "@shared/schema";

const r = Router();

/**
 * GET /api/admin/ta?storeId=sk-previews123 (optional)
 * Returns latest 50 photo uploads with inline data URLs for preview.
 */
r.get(
  "/admin/task-previews",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;

      const base = db
        .select({
          photoId: taskPhotos.id,
          uploadedAt: taskPhotos.uploadedAt,
          filename: taskPhotos.filename,
          mimeType: taskPhotos.mimeType,
          uploadedByName: taskPhotos.uploadedByName,
          uploadedByRole: taskPhotos.uploadedByRole,
          url: taskPhotos.url, // <-- data URL
          taskId: tasks.id,
          storeId: tasks.storeId,
          templateId: taskTemplates.id,
          listId: taskLists.id,
          listName: taskLists.name,
        })
        .from(taskPhotos)
        .leftJoin(tasks, eq(taskPhotos.taskId, tasks.id))
        .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
        .leftJoin(taskLists, eq(taskTemplates.listId, taskLists.id));

      const rows = qStoreId
        ? await base.where(eq(tasks.storeId, qStoreId)).orderBy(desc(taskPhotos.uploadedAt)).limit(50)
        : await base.orderBy(desc(taskPhotos.uploadedAt)).limit(50);

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to load previews" });
    }
  }
);

export default r;
