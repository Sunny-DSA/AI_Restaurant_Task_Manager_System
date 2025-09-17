// server/routes/admin.ts
import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { db } from "../db";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  taskPhotos,
  tasks,
  taskTemplates,
  taskLists,
  stores as storesTable,
  users as usersTable,
  roleEnum,
} from "@shared/schema";
import { haversineMeters } from "../utils/geo";

const r = Router();

/**
 * (kept) Simple previews endpoint with inline data URLs
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
          url: taskPhotos.url,
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

/**
 * Rich photo feed with filters and distance/quality
 * GET /api/admin/photo-feed?storeId=&userId=&dateFrom=&dateTo=&limit=&sort=newest|oldest
 */
r.get(
  "/admin/photo-feed",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const q = req.query || {};

      const limit = Math.max(1, Math.min(200, Number(q.limit) || 100));
      const storeId = q.storeId ? Number(q.storeId) : undefined;
      const userId = q.userId ? Number(q.userId) : undefined;
      const sort: "newest" | "oldest" = q.sort === "oldest" ? "oldest" : "newest";

      // Parse date range (treat values as local date if just YYYY-MM-DD)
      const toDate = (v: any): Date | undefined => {
        if (!v) return undefined;
        const s = String(v);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          // whole day (local) -> build UTC bounds
          return new Date(`${s}T00:00:00.000Z`);
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const from = toDate(q.dateFrom);
      const toRaw = toDate(q.dateTo);
      // end-of-day if only a date was given
      const to = toRaw
        ? /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(toRaw.toISOString())
          ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000 - 1)
          : toRaw
        : undefined;

      // Base select with joins we need for details
      const base = db
        .select({
          id: taskPhotos.id,
          uploadedAt: taskPhotos.uploadedAt,
          uploadedById: (taskPhotos as any).uploadedBy,
          uploadedByName: taskPhotos.uploadedByName,
          uploadedByRole: taskPhotos.uploadedByRole,

          taskId: tasks.id,
          taskTitle: tasks.title,
          listId: taskLists.id,
          listName: taskLists.name,
          templateId: taskTemplates.id,
          templateTitle: taskTemplates.title,

          storeId: tasks.storeId,
          storeName: (storesTable as any).name,
          storeLat: (storesTable as any).latitude,
          storeLng: (storesTable as any).longitude,
          storeRadiusM: (storesTable as any).geofenceRadius,

          photoLat: (taskPhotos as any).latitude,
          photoLng: (taskPhotos as any).longitude,
        })
        .from(taskPhotos)
        .leftJoin(tasks, eq(taskPhotos.taskId, tasks.id))
        .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
        .leftJoin(taskLists, eq(taskTemplates.listId, taskLists.id))
        .leftJoin(storesTable, eq(tasks.storeId, storesTable.id))
        .leftJoin(usersTable, eq((taskPhotos as any).uploadedBy, usersTable.id));

      // dynamic WHERE
      const conds: any[] = [];
      if (storeId) conds.push(eq(tasks.storeId, storeId));
      if (userId) conds.push(eq((taskPhotos as any).uploadedBy, userId));
      if (from) conds.push(gte(taskPhotos.uploadedAt, from));
      if (to) conds.push(lte(taskPhotos.uploadedAt, to));

      const ordered = sort === "oldest"
        ? base.orderBy(asc(taskPhotos.uploadedAt))
        : base.orderBy(desc(taskPhotos.uploadedAt));

      const rows = conds.length
        ? await (ordered as any).where(and(...conds)).limit(limit)
        : await (ordered as any).limit(limit);

      const parseNum = (v: any): number | null => {
        const n = typeof v === "string" ? Number(v) : (typeof v === "number" ? v : NaN);
        return Number.isFinite(n) ? n : null;
      };

      const out = (rows || []).map((r) => {
        const gpsLat = parseNum((r as any).photoLat);
        const gpsLng = parseNum((r as any).photoLng);
        const gps = gpsLat != null && gpsLng != null ? { latitude: gpsLat, longitude: gpsLng } : null;

        const sLat = parseNum((r as any).storeLat);
        const sLng = parseNum((r as any).storeLng);
        const center = sLat != null && sLng != null ? { lat: sLat, lng: sLng } : null;

        const radiusM = parseNum((r as any).storeRadiusM);

        let distanceM: number | null = null;
        let quality: "inside" | "near" | "outside" | "unknown" = "unknown";
        if (gps && center && radiusM != null) {
          distanceM = haversineMeters({ lat: gps.latitude, lng: gps.longitude }, center);
          if (distanceM <= radiusM) quality = "inside";
          else if (distanceM <= radiusM * 1.5) quality = "near";
          else quality = "outside";
        }

        return {
          id: r.id,
          taskId: r.taskId ?? null,
          taskItemId: null,
          uploadedAt: r.uploadedAt,
          uploadedById: (r as any).uploadedById ?? null,
          uploadedByName: r.uploadedByName ?? null,
          uploadedByRole: r.uploadedByRole ?? null,
          photoUrl: `/api/photos/${r.id}`,
          task: r.taskId
            ? {
                id: r.taskId,
                title: r.taskTitle ?? null,
                listId: r.listId ?? null,
                listName: r.listName ?? null,
                templateId: r.templateId ?? null,
                templateTitle: r.templateTitle ?? null,
              }
            : null,
          store: r.storeId
            ? {
                id: r.storeId,
                name: (r as any).storeName ?? null,
                center,
                radiusM,
              }
            : null,
          gps,
          distanceM,
          quality,
        };
      });

      res.json(out);
    } catch (e: any) {
      console.error("photo-feed error:", e);
      res.status(500).json({ message: e?.message || "Failed to load photo feed" });
    }
  }
);

export default r;
