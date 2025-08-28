// server/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { haversineMeters } from "../utils/geo";

// attachs req.user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email?: string;
    firstName?: string;
    lastName?: string;
    role: string;
    storeId?: number;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const user = await storage.getUser(userId);
    if (!user || !user.isActive) return res.status(401).json({ message: "Invalid user" });

    req.user = {
      id: user.id,
      email: user.email || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      role: user.role,
      storeId: user.storeId || undefined,
    };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "Authentication error" });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Insufficient permissions",
        required: allowedRoles,
        current: req.user.role,
      });
    }
    next();
  };
};

// Optional helper if you still gate actions by store membership
export const requireStore = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user?.storeId && req.user?.role !== "master_admin") {
    return res.status(403).json({ message: "Store assignment required" });
  }
  next();
};

/**
 * Geofence validation middleware
 * Matches current schema.ts field names: latitude, longitude, geofenceRadius
 * Sends 400 if coords missing / store not configured; 403 if outside fence.
 */
export const validateGeofence = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ message: "Location required for this action" });
    }

    if (!req.user?.storeId) {
      return res.status(400).json({ message: "Store information required" });
    }

    const store = await storage.getStore(req.user.storeId);
    if (!store) return res.status(400).json({ message: "Store not found" });

    // schema.ts: stores.latitude, stores.longitude are DECIMAL → often strings in JS; coerce to numbers
    const lat =
      store.latitude != null && store.latitude !== ""
        ? Number(store.latitude)
        : undefined;
    const lng =
      store.longitude != null && store.longitude !== ""
        ? Number(store.longitude)
        : undefined;
    const radiusM =
      typeof store.geofenceRadius === "number"
        ? store.geofenceRadius
        : store.geofenceRadius != null
        ? Number(store.geofenceRadius)
        : 100; // default 100m

    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: "Store location not configured" });
    }

    const distance = haversineMeters({ lat, lng }, { lat: latitude, lng: longitude });
    if (distance > radiusM) {
      return res.status(403).json({
        message: "Location verification failed",
        distance: Math.round(distance),
        allowedRadius: radiusM,
      });
    }

    next();
  } catch (error) {
    console.error("Geofence validation error:", error);
    res.status(500).json({ message: "Location validation error" });
  }
};
