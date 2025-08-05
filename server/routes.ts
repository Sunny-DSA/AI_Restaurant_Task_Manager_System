import express, { type Request, type Response } from "express";
import session from "express-session";
import { Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./services/authService";
import { StoreService } from "./services/storeService";
import { TaskService } from "./services/taskService";
import { requireAuth } from "./middleware/auth";
import { upload } from "./middleware/upload";
import bcrypt from "bcrypt";

// WebSocket connections map (disabled for now to avoid conflicts)
const wsConnections = new Map();

interface AuthenticatedRequest extends Request {
  user?: any;
}

export async function registerRoutes(
  app: express.Application,
): Promise<Server> {
  
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true
    }
  }));

  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, pin, storeId } = req.body;

      let user;
      if (email && password) {
        // Admin/manager login with email
        user = await AuthService.authenticateWithEmail(email, password);
      } else if (pin && storeId) {
        // Employee login with PIN
        user = await AuthService.authenticateWithPin(pin, storeId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials provided"
        });
      }

      // Set session
      req.session.userId = user.id;
      req.session.user = user;

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          storeId: user.storeId
        }
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(401).json({
        success: false,
        message: error.message || "Invalid email or password"
      });
    }
  });

  app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      storeId: req.user.storeId
    });
  });

  app.post("/api/auth/logout", (req: AuthenticatedRequest, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // QR code verification route
  app.post("/api/auth/verify-qr", async (req: Request, res: Response) => {
    try {
      const { qrData, latitude, longitude } = req.body;

      if (!qrData) {
        return res.status(400).json({ 
          success: false, 
          message: "QR data is required" 
        });
      }

      const verification = await StoreService.verifyQRCode(qrData);
      
      if (!verification.isValid) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid or expired QR code" 
        });
      }

      res.json({
        success: true,
        storeId: verification.storeId,
        employeeId: verification.employeeId,
      });
    } catch (error) {
      console.error('QR verification error:', error);
      res.status(500).json({ 
        success: false, 
        message: "QR verification failed" 
      });
    }
  });

  // Tasks routes
  app.get("/api/tasks/my", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tasks = await TaskService.getUserTasks(req.user.id);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId, status, assignedTo } = req.query;
      const tasks = await TaskService.getTasks({
        storeId: storeId ? Number(storeId) : undefined,
        status: status as string,
        assignedTo: assignedTo ? Number(assignedTo) : undefined
      });
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Store routes
  app.get("/api/stores", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stores = await storage.getAllStores();
      res.json(stores);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Users routes  
  app.get("/api/users", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const users = storeId 
        ? await storage.getUsersByStore(Number(storeId))
        : await storage.getActiveUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }

    await storage.updateStore(storeId, {
      qrCode,
      qrCodeSecret: secret,
      qrCodeExpiresAt: expiresAt,
    });

    return qrCode;
  }

  static async verifyQRCode(qrData: string): Promise<{ storeId: number; employeeId?: number; isValid: boolean }> {
    try {
      const parsed = JSON.parse(qrData);
      const { storeId, secret, employeeId } = parsed;

      if (!storeId || !secret || !employeeId) {
        return { storeId: 0, isValid: false };
      }

      const store = await storage.getStore(storeId);
      if (!store || !store.qrCodeSecret || !store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }

      if (new Date() > store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(store.qrCodeSecret),
        Buffer.from(secret)
      );

      return { storeId, employeeId, isValid };
    } catch (error) {
      return { storeId: 0, isValid: false };
    }
  }

  static validateGeofence(
    store: { latitude: string | null; longitude: string | null; geofenceRadius?: number },
    userLat: number,
    userLon: number
  ): { isValid: boolean; distance: number; allowedRadius: number } {
    const storeLat = parseFloat(store?.latitude ?? "0");
    const storeLon = parseFloat(store?.longitude ?? "0");
    const allowedRadius = store?.geofenceRadius ?? 100;

    if (!store.latitude || !store.longitude || isNaN(storeLat) || isNaN(storeLon)) {
      return { isValid: false, distance: 0, allowedRadius };
    }

    const distance = this.calculateDistance(storeLat, storeLon, userLat, userLon);
    const isValid = distance <= allowedRadius;

    return { isValid, distance, allowedRadius };
  }

  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  static async getStoreStats(storeId: number) {
    const [taskStats, userStats] = await Promise.all([
      storage.getTaskStats(storeId),
      storage.getUserStats(storeId),
    ]);

    return {
      ...taskStats,
      ...userStats,
    };
  }
}
