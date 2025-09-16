// server/routes/admin.ts
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { db } from "../db";
import { taskPhotos, taskTemplates, taskLists, tasks, roleEnum } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const r = Router();

r.get("/admin/task-previews",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req, res) => {
    const { db } = await import("../db");
    const { sql, eq, desc } = await import("drizzle-orm");
    const { taskPhotos, tasks, taskTemplates, taskLists } = await import("@shared/schema");

    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;

    const rows = await db
      .select({
        photoId: taskPhotos.id,
        uploadedAt: taskPhotos.uploadedAt,
        filename: taskPhotos.filename,
        mimeType: taskPhotos.mimeType,
        uploadedByName: taskPhotos.uploadedByName,
        uploadedByRole: taskPhotos.uploadedByRole,
        url: taskPhotos.url, // 👈 data URL for <img>
        taskId: tasks.id,
        storeId: tasks.storeId,
        templateId: taskTemplates.id,
        listId: taskLists.id,
        listName: taskLists.name,
      })
      .from(taskPhotos)
      .leftJoin(tasks, eq(taskPhotos.taskId, tasks.id))
      .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
      .leftJoin(taskLists, eq(taskTemplates.listId, taskLists.id))
      .where(qStoreId ? eq(tasks.storeId, qStoreId) : sql`true`)
      .orderBy(desc(taskPhotos.uploadedAt))
      .limit(50);

    res.json(rows);
  }
);


export default r;
