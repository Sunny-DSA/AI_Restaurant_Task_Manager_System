import express, { type Request, type Response } from "express";
import session from "express-session";
import { Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./services/authService";
import { StoreService } from "./services/storeService";
import { TaskService } from "./services/taskService";
import { authenticateToken } from "./middleware/auth";
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

  app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/tasks/my", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tasks = await TaskService.getUserTasks(req.user.id);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/stores", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stores = await storage.getAllStores();
      res.json(stores);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Users routes  
  app.get("/api/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const users = storeId 
        ? await storage.getUsersByStore(Number(storeId))
        : await storage.getActiveUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create HTTP server
  const server = new Server(app);

  // TODO: WebSocket setup disabled temporarily to avoid conflicts with Vite WebSocket
  // Will need to configure on different path when implementing real-time features
  
  return server;
}