import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { roleEnum } from "@shared/schema";

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
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const user = await storage.getUser(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid user" });
    }
    
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
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
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

export const requireStore = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user?.storeId && req.user?.role !== roleEnum.MASTER_ADMIN) {
    return res.status(403).json({ message: "Store assignment required" });
  }
  next();
};

export const validateGeofence = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Location required for this action" });
    }
    
    if (!req.user?.storeId) {
      return res.status(400).json({ message: "Store information required" });
    }
    
    const store = await storage.getStore(req.user.storeId);
    if (!store || !store.latitude || !store.longitude) {
      return res.status(400).json({ message: "Store location not configured" });
    }
    
    // Calculate distance using Haversine formula
    const distance = calculateDistance(
      Number(store.latitude),
      Number(store.longitude),
      latitude,
      longitude
    );
    
    const allowedRadius = store.geofenceRadius || 100; // meters
    
    if (distance > allowedRadius) {
      return res.status(403).json({ 
        message: "Location verification failed",
        distance: Math.round(distance),
        allowedRadius,
      });
    }
    
    next();
  } catch (error) {
    console.error("Geofence validation error:", error);
    res.status(500).json({ message: "Location validation error" });
  }
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
