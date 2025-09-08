// server/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { haversineMeters } from "../utils/geo";

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

/** Populate req.user from the session userId */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const user = await storage.getUser(Number(userId));
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid user" });
    }

    req.user = {
      id: user.id,
      email: user.email ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      role: user.role,
      storeId: user.storeId ?? undefined,
    };
    // make user available to views
    res.locals.user = req.user;
    
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    res.status(500).json({ message: "Authentication error" });
  }
};

/** Role gate */
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

/** Optional: ensure user belongs to a store unless master_admin */
export const requireStore = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.storeId && req.user?.role !== "master_admin") {
    return res.status(403).json({ message: "Store assignment required" });
  }
  next();
};

/** Optional: validate current location is within the store geofence */
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

    // DECIMALs often arrive as strings – coerce
    const lat =
      store.latitude != null && store.latitude !== "" ? Number(store.latitude) : undefined;
    const lng =
      store.longitude != null && store.longitude !== "" ? Number(store.longitude) : undefined;
    const radiusM =
      typeof store.geofenceRadius === "number"
        ? store.geofenceRadius
        : store.geofenceRadius != null
        ? Number(store.geofenceRadius)
        : 200; // Increased from 100m to 200m for better GPS tolerance

    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: "Store location not configured" });
    }

    const distance = haversineMeters({ lat, lng }, { lat: latitude, lng: longitude });
    
    // Debug logging
    console.log(`Geofence validation: Store(${lat}, ${lng}), User(${latitude}, ${longitude}), Distance: ${Math.round(distance)}m, Allowed: ${radiusM}m`);
    
    if (distance > radiusM) {
      return res.status(403).json({
        message: "Location verification failed",
        distance: Math.round(distance),
        allowedRadius: radiusM,
        storeLocation: { lat, lng },
        userLocation: { lat: latitude, lng: longitude },
      });
    }

    next();
  } catch (err) {
    console.error("Geofence validation error:", err);
    res.status(500).json({ message: "Location validation error" });
  }
};
