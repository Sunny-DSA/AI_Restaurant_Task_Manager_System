// server/routes/admin.ts
import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { db } from "../db";
import { eq, desc, inArray } from "drizzle-orm";
import { taskPhotos, tasks, taskTemplates, taskLists, roleEnum, stores as storesTbl } from "@shared/schema";
import { storage } from "../storage";

const r = Router();

/**
 * Legacy: GET /api/admin/task-previews
 * (kept for compatibility; returns inline data URLs)
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
 * New: GET /api/admin/photo-feed?storeId=&limit=
 * Returns compact items with photoUrl, GPS, distance to store center, and quality.
 */
r.get(
  "/admin/photo-feed",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

      const base = db
        .select({
          id: taskPhotos.id,
          uploadedAt: taskPhotos.uploadedAt,
          uploadedBy: taskPhotos.uploadedBy,
          uploadedByName: taskPhotos.uploadedByName,
          uploadedByRole: taskPhotos.uploadedByRole,
          lat: taskPhotos.latitude,
          lng: taskPhotos.longitude,
          taskId: tasks.id,
          storeId: tasks.storeId,
        })
        .from(taskPhotos)
        .leftJoin(tasks, eq(taskPhotos.taskId, tasks.id));

      const rows = qStoreId
        ? await base.where(eq(tasks.storeId, qStoreId)).orderBy(desc(taskPhotos.uploadedAt)).limit(limit)
        : await base.orderBy(desc(taskPhotos.uploadedAt)).limit(limit);

      // gather needed store info
      const storeIds = Array.from(new Set(rows.map(r => r.storeId).filter(Boolean))) as number[];

      // Try db join first; if schema differs, fallback to storage.getStore
      let storeMap = new Map<number, { id: number; name: string | null; lat: number | null; lng: number | null; radiusM: number | null }>();
      if ((storesTbl as any)) {
        const storeRows = storeIds.length
          ? await db.select().from(storesTbl).where(inArray(storesTbl.id as any, storeIds as any))
          : [];
        for (const s of storeRows as any[]) {
          storeMap.set(s.id, {
            id: s.id,
            name: s.name ?? null,
            lat: s.latitude != null ? Number(s.latitude) : null,
            lng: s.longitude != null ? Number(s.longitude) : null,
            radiusM: s.geofenceRadius != null ? Number(s.geofenceRadius) : null,
          });
        }
      } else {
        for (const id of storeIds) {
          const s = await storage.getStore(id);
          if (s) {
            storeMap.set(s.id, {
              id: s.id,
              name: s.name ?? null,
              lat: s.latitude != null ? Number(s.latitude) : null,
              lng: s.longitude != null ? Number(s.longitude) : null,
              radiusM: s.geofenceRadius != null ? Number(s.geofenceRadius) : null,
            });
          }
        }
      }

      const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371000; // meters
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const la1 = toRad(a.lat);
        const la2 = toRad(b.lat);
        const sinDLat = Math.sin(dLat / 2);
        const sinDLng = Math.sin(dLng / 2);
        const h =
          sinDLat * sinDLat +
          Math.cos(la1) * Math.cos(la2) * sinDLng * sinDLng;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
      };

      const items = rows.map((r) => {
        const store = r.storeId ? storeMap.get(r.storeId) : undefined;

        let distanceM: number | null = null;
        let quality: "inside" | "near" | "outside" | "unknown" = "unknown";

        const gpsOk = r.lat != null && r.lng != null;
        const storeOk = !!store && store.lat != null && store.lng != null && store.radiusM != null;

        if (gpsOk && storeOk) {
          distanceM = haversine(
            { lat: Number(r.lat), lng: Number(r.lng) },
            { lat: Number(store!.lat), lng: Number(store!.lng) }
          );
          if (distanceM <= (store!.radiusM as number)) quality = "inside";
          else if (distanceM <= (store!.radiusM as number) + 50) quality = "near";
          else quality = "outside";
        }

        return {
          id: r.id,
          taskId: r.taskId ?? null,
          taskItemId: null,
          uploadedAt: r.uploadedAt,
          uploadedBy: r.uploadedBy ?? null,
          uploadedByName: r.uploadedByName ?? null,
          uploadedByRole: r.uploadedByRole ?? null,
          photoUrl: `/api/photos/${r.id}`,
          store: store
            ? {
                id: store.id,
                name: store.name ?? null,
                center: store.lat != null && store.lng != null ? { lat: store.lat, lng: store.lng } : null,
                radiusM: store.radiusM ?? null,
              }
            : null,
          gps: r.lat != null && r.lng != null ? { latitude: Number(r.lat), longitude: Number(r.lng) } : null,
          distanceM,
          quality,
        };
      });

      res.json(items);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to load photo feed" });
    }
  }
);

export default r;
