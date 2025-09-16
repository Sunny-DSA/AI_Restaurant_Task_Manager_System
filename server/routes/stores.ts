// server/routes/stores.ts
import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { storage } from "../storage";
import { roleEnum } from "@shared/schema";

const r = Router();

// --- helper: geocode with OpenStreetMap Nominatim ---
async function geocodeAddress(address?: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(address.trim());
  // Node 18+ has global fetch
  const resp = await fetch(url, {
    headers: {
      // Nominatim requires a descriptive UA. Put your email/app here if you want.
      "User-Agent": "RestaurantTask/1.0 (admin@example.com)",
    },
  });
  if (!resp.ok) return null;
  const data: any[] = await resp.json();
  if (!Array.isArray(data) || !data[0]) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** List stores the caller can see */
r.get("/stores", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role === roleEnum.MASTER_ADMIN || user.role === roleEnum.ADMIN) {
      const stores = await storage.getStores();
      return res.json(stores || []);
    }
    if (user.storeId) {
      const store = await storage.getStore(user.storeId);
      return res.json(store ? [store] : []);
    }
    return res.json([]);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch stores" });
  }
});

/** Get one store (role-gated) */
r.get("/stores/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;
    const isAdmin = user.role === roleEnum.MASTER_ADMIN || user.role === roleEnum.ADMIN;
    if (!isAdmin && user.storeId !== storeId) {
      return res.status(403).json({ message: "Unauthorized to view this store" });
    }
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch store" });
  }
});

/** Create store (admins only) — auto-geocode if lat/lng missing */
r.post(
  "/stores",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      let latitude = b.latitude != null ? Number(b.latitude) : undefined;
      let longitude = b.longitude != null ? Number(b.longitude) : undefined;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const geo = await geocodeAddress(b.address);
        if (geo) {
          latitude = geo.lat;
          longitude = geo.lng;
        }
      }

      const newStore = await storage.createStore({
        name: String(b.name || "Store"),
        address: b.address ?? "",
        phone: b.phone ?? null,
        timezone: b.timezone || "UTC",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        geofenceRadius: Number.isFinite(b.geofenceRadius) ? Number(b.geofenceRadius) : 100,
        isActive: b.isActive !== false,
      } as any);

      res.status(201).json(newStore);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create store" });
    }
  }
);

/** Update store (admins only) — auto-geocode when address changes and lat/lng not supplied */
r.put(
  "/stores/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const storeId = Number(req.params.id);
      const b = req.body ?? {};

      let patch: any = {
        name: b.name,
        address: b.address,
        phone: b.phone,
        timezone: b.timezone,
        geofenceRadius: b.geofenceRadius != null ? Number(b.geofenceRadius) : undefined,
        isActive: b.isActive,
      };

      // If the caller didn’t supply lat/lng but did supply a new address, try to geocode.
      const hasExplicitLatLng =
        b.latitude != null && b.longitude != null && Number.isFinite(Number(b.latitude)) && Number.isFinite(Number(b.longitude));

      if (hasExplicitLatLng) {
        patch.latitude = Number(b.latitude);
        patch.longitude = Number(b.longitude);
      } else if (typeof b.address === "string" && b.address.trim()) {
        const geo = await geocodeAddress(b.address);
        if (geo) {
          patch.latitude = geo.lat;
          patch.longitude = geo.lng;
        }
      }

      const updated = await storage.updateStore(storeId, patch);
      if (!updated) return res.status(404).json({ message: "Store not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update store" });
    }
  }
);

/** Simple stats (so the UI query never returns undefined) */
r.get("/stores/:id/stats", authenticateToken, async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    const allTasks = await storage.getTasks({ storeId });
    const total = (allTasks || []).length;
    const completed = (allTasks || []).filter((t: any) => t.status === "completed").length;
    const overdue = (allTasks || []).filter((t: any) => {
      if (!t.dueAt || t.status === "completed") return false;
      return new Date(t.dueAt).getTime() < Date.now();
    }).length;

    // If you have users-by-store in storage, use that here; otherwise return zero safely.
    const totalUsers = 0;
    const checkedInUsers = 0;

    res.json({
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
      averageCompletionTime: 0,
      completionRate: total ? (completed / total) * 100 : 0,
      totalUsers,
      activeUsers: totalUsers, // placeholder
      checkedInUsers,
    });
  } catch (err: any) {
    res.status(200).json({
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      averageCompletionTime: 0,
      completionRate: 0,
      totalUsers: 0,
      activeUsers: 0,
      checkedInUsers: 0,
    });
  }
});

export default r;
