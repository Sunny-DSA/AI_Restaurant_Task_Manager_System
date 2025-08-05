import { storage } from "./storage";
import { InsertStore, loginSchema, claimTaskSchema, completeTaskItemSchema, transferTaskSchema, insertStoreSchema, insertTaskTemplateSchema, insertUserSchema, roleEnum, taskStatusEnum } from "@shared/schema";
import QRCode from "qrcode";
import crypto from "crypto";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { AuthService } from "./services/authService";

// Types for authenticated requests
interface AuthenticatedRequest extends Request {
  session: any;
  user?: {
    id: number;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    storeId?: number | null;
  };
}

// Authentication middleware
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.session.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const user = await storage.getUser(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid session" });
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
    res.status(500).json({ message: "Authentication error" });
  }
};

export class StoreService {
  static async createStore(storeData: InsertStore) {
    const store = await storage.createStore(storeData);

    // Generate QR code for the new store
    await this.generateQRCode(store.id);

    return store;
  }

  static async generateQRCode(storeId: number) {
    const store = await storage.getStore(storeId);
    if (!store) {
      throw new Error("Store not found");
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const qrData = {
      storeId: store.id,
      employeeId: store.id, // Assuming employeeId = storeId temporarily
      secret,
      version: 1,
    };

    const qrCodeData = JSON.stringify(qrData);
    const qrCode = await QRCode.toDataURL(qrCodeData);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

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
    if (!store.latitude || !store.longitude) {
      return { isValid: false, distance: 0, allowedRadius: store.geofenceRadius || 100 };
    }

    const storeLat = parseFloat(store.latitude);
    const storeLon = parseFloat(store.longitude);

    const distance = this.calculateDistance(storeLat, storeLon, userLat, userLon);
    const allowedRadius = store.geofenceRadius || 100;
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

// WebSocket connections map
const wsConnections = new Map<number, WebSocket>(); // userId -> WebSocket

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // Authentication routes
  app.post("/api/auth/login", async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      let user;

      if (validatedData.email) {
        // Admin login with email/password
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ 
            success: false,
            message: "Email and password are required" 
          });
        }

        user = await AuthService.authenticateWithEmail(email, password);
      } else if (validatedData.pin && validatedData.storeId) {
        // Store employee login with PIN
        user = await AuthService.authenticateWithPin(validatedData.pin, validatedData.storeId);
      } else {
        return res.status(400).json({ 
          success: false,
          message: "Invalid login data" 
        });
      }

      // Store user ID in session
      req.session.userId = user.id;

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          storeId: user.storeId,
        }
      });
    } catch (error: any) {
      console.error('Login error:', error);

      // Handle specific authentication errors
      if (error.message.includes('Invalid') || error.message.includes('credentials')) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid email or password" 
        });
      }

      // Handle validation errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false,
          message: "Please check your input and try again" 
        });
      }

      // Generic error for unexpected issues
      res.status(500).json({ 
        success: false,
        message: "Server error. Please try again later." 
      });
    }
  });

  app.post("/api/auth/logout", (req: AuthenticatedRequest, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
    res.json(req.user);
  });

  // QR Code verification and check-in
  app.post("/api/auth/verify-qr", async (req, res) => {
    try {
      const { qrData, latitude, longitude } = req.body;
      
      if (!qrData) {
        return res.status(400).json({ 
          success: false, 
          message: "QR code data is required" 
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

  // Create HTTP server
  const server = new Server(app);

  // TODO: WebSocket setup disabled temporarily to avoid conflicts with Vite WebSocket
  // Will need to configure on different path when implementing real-time features
  
  return server;
}
