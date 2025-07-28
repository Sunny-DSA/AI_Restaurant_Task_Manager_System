import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import "./types/session"; // Import session types
import { storage } from "./storage";
import { authenticateToken, requireRole, requireStore, validateGeofence, type AuthenticatedRequest } from "./middleware/auth";
import { upload } from "./middleware/upload";
import { AuthService } from "./services/authService";
import { TaskService } from "./services/taskService";
import { StoreService } from "./services/storeService";
import { QRService } from "./services/qrService";
import { 
  loginSchema, 
  claimTaskSchema, 
  completeTaskItemSchema,
  transferTaskSchema,
  insertStoreSchema,
  insertTaskTemplateSchema,
  insertUserSchema,
  roleEnum,
  taskStatusEnum,
} from "@shared/schema";
import path from "path";

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
        user = await AuthService.authenticateWithEmail(email, password);
      } else if (validatedData.pin && validatedData.storeId) {
        // Store employee login with PIN
        user = await AuthService.authenticateWithPin(validatedData.pin, validatedData.storeId);
      } else {
        return res.status(400).json({ message: "Invalid login data" });
      }
      
      // Store user ID in session
      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        storeId: user.storeId,
      });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
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
        return res.status(400).json({ message: "QR code data required" });
      }
      
      const verification = await StoreService.verifyQRCode(qrData);
      if (!verification.isValid) {
        return res.status(400).json({ message: "Invalid or expired QR code" });
      }
      
      // Validate geofence if location provided
      if (latitude && longitude) {
        const geofence = await StoreService.validateGeofence(
          verification.storeId, 
          latitude, 
          longitude
        );
        
        if (!geofence.isValid) {
          return res.status(403).json({ 
            message: "Location verification failed",
            distance: geofence.distance,
            allowedRadius: geofence.allowedRadius,
          });
        }
      }
      
      const store = await storage.getStore(verification.storeId);
      res.json({ 
        storeId: verification.storeId,
        storeName: store?.name,
        isValid: true,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/checkin", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { storeId, latitude, longitude } = req.body;
      
      if (!req.user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Validate geofence
      if (latitude && longitude) {
        const geofence = await StoreService.validateGeofence(storeId, latitude, longitude);
        if (!geofence.isValid) {
          return res.status(403).json({ 
            message: "Location verification failed",
            distance: geofence.distance,
            allowedRadius: geofence.allowedRadius,
          });
        }
      }
      
      // Check if user is already checked in
      const existingCheckIn = await storage.getActiveCheckIn(req.user.id);
      if (existingCheckIn) {
        return res.status(400).json({ message: "User already checked in" });
      }
      
      const checkIn = await storage.createCheckIn({
        userId: req.user.id,
        storeId,
        latitude: latitude?.toString(),
        longitude: longitude?.toString(),
      });
      
      res.json(checkIn);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/checkout", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const activeCheckIn = await storage.getActiveCheckIn(req.user.id);
      if (!activeCheckIn) {
        return res.status(400).json({ message: "User not checked in" });
      }
      
      const updatedCheckIn = await storage.updateCheckIn(activeCheckIn.id, {
        checkedOutAt: new Date(),
      });
      
      res.json(updatedCheckIn);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Store management routes
  app.get("/api/stores", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]), async (req, res) => {
    try {
      const stores = await storage.getStores();
      res.json(stores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stores/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = parseInt(req.params.id);
      const store = await storage.getStore(storeId);
      
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }
      
      // Check permissions
      if (req.user?.role === roleEnum.STORE_MANAGER && req.user.storeId !== storeId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(store);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/stores", authenticateToken, requireRole([roleEnum.MASTER_ADMIN]), async (req, res) => {
    try {
      const validatedData = insertStoreSchema.parse(req.body);
      const store = await StoreService.createStore(validatedData);
      res.status(201).json(store);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/stores/:id", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]), async (req, res) => {
    try {
      const storeId = parseInt(req.params.id);
      const updates = req.body;
      
      const store = await storage.updateStore(storeId, updates);
      res.json(store);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/stores/:id/generate-qr", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]), async (req, res) => {
    try {
      const storeId = parseInt(req.params.id);
      const qrCode = await StoreService.generateQRCode(storeId);
      res.json({ qrCode });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stores/:id/qr-pdf", authenticateToken, async (req, res) => {
    try {
      const storeId = parseInt(req.params.id);
      const pdfBuffer = await QRService.generateStorePDF(storeId);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="store-${storeId}-qr.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stores/:id/stats", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = parseInt(req.params.id);
      
      // Check permissions
      if (req.user?.role === roleEnum.STORE_MANAGER && req.user.storeId !== storeId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const stats = await StoreService.getStoreStats(storeId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // User management routes
  app.get("/api/users", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      let users;
      
      if (req.user?.role === roleEnum.STORE_MANAGER) {
        // Store managers can only see users in their store
        users = await storage.getUsersByStore(req.user.storeId!);
      } else {
        // Admins can see all users
        const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : undefined;
        users = await storage.getActiveUsers(storeId);
      }
      
      // Remove sensitive fields
      const safeUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        storeId: user.storeId,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      }));
      
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]), async (req, res) => {
    try {
      const { password, ...userData } = req.body;
      const validatedData = insertUserSchema.parse(userData);
      
      const user = await AuthService.createUser(validatedData, password);
      
      // Remove sensitive fields
      const safeUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        storeId: user.storeId,
        pin: user.pin, // Include PIN for new users
        isActive: user.isActive,
        createdAt: user.createdAt,
      };
      
      res.status(201).json(safeUser);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/reset-pin", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await AuthService.resetUserPin(userId);
      
      res.json({ 
        id: user.id,
        pin: user.pin,
        message: "PIN reset successfully",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Task template routes
  app.get("/api/task-templates", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : req.user?.storeId;
      const templates = await storage.getTaskTemplates(storeId);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/task-templates", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertTaskTemplateSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
      });
      
      const template = await storage.createTaskTemplate(validatedData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Task routes
  app.get("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : req.user?.storeId;
      const status = req.query.status as string;
      const assigneeId = req.query.assigneeId ? parseInt(req.query.assigneeId as string) : undefined;
      
      const tasks = await storage.getTasks({
        storeId,
        status,
        assigneeId,
      });
      
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tasks/my", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const tasks = await TaskService.getTasksForUser(req.user!.id);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tasks/available", authenticateToken, requireStore, async (req: AuthenticatedRequest, res) => {
    try {
      const tasks = await TaskService.getAvailableTasks(req.user!.storeId!);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tasks", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      const taskData = {
        ...req.body,
        createdBy: req.user!.id,
      };
      
      const task = await TaskService.createTask(taskData);
      
      // Broadcast task creation via WebSocket
      broadcastTaskUpdate(task);
      
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Task Lists endpoints
  app.get("/api/task-lists", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      const taskLists = await storage.getTaskLists();
      res.json(taskLists);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/task-lists", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      const listData = {
        ...req.body,
        createdBy: req.user!.id,
      };
      
      const taskList = await storage.createTaskList(listData);
      res.status(201).json(taskList);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/task-lists/:id", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteTaskList(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/task-lists/:id/duplicate", authenticateToken, requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]), async (req: AuthenticatedRequest, res) => {
    try {
      const taskList = await storage.duplicateTaskList(parseInt(req.params.id), req.user!.id);
      res.status(201).json(taskList);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/claim", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const validatedData = claimTaskSchema.parse({ taskId, ...req.body });
      
      const task = await TaskService.claimTask(
        taskId, 
        req.user!.id, 
        validatedData.latitude, 
        validatedData.longitude
      );
      
      // Broadcast task update via WebSocket
      broadcastTaskUpdate(task);
      
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/transfer", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const validatedData = transferTaskSchema.parse({ taskId, ...req.body });
      
      const transfer = await TaskService.transferTask(
        taskId,
        req.user!.id,
        validatedData.toUserId,
        validatedData.reason
      );
      
      // Get updated task and broadcast
      const task = await storage.getTask(taskId);
      if (task) {
        broadcastTaskUpdate(task);
      }
      
      res.json(transfer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const { notes } = req.body;
      
      const task = await TaskService.completeTask(taskId, req.user!.id, notes);
      
      // Broadcast task update via WebSocket
      broadcastTaskUpdate(task);
      
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/items", authenticateToken, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const items = await storage.getTaskItems(taskId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/task-items/:id", authenticateToken, async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const updates = req.body;
      
      const item = await storage.updateTaskItem(itemId, updates);
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Photo upload routes
  app.post("/api/tasks/:id/photos", authenticateToken, upload.single("photo"), async (req: AuthenticatedRequest, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "Photo file required" });
      }
      
      const { latitude, longitude, taskItemId } = req.body;
      
      // Create photo record
      const photo = await storage.createTaskPhoto({
        taskId,
        taskItemId: taskItemId ? parseInt(taskItemId) : undefined,
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        latitude: latitude ? latitude.toString() : undefined,
        longitude: longitude ? longitude.toString() : undefined,
        uploadedBy: req.user!.id,
      });
      
      // Update task photo count
      const task = await storage.getTask(taskId);
      if (task) {
        await storage.updateTask(taskId, {
          photosUploaded: (task.photosUploaded || 0) + 1,
        });
      }
      
      res.json(photo);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/photos", authenticateToken, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const photos = await storage.getTaskPhotos(taskId);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    // Add basic security for uploaded files
    const filePath = path.join(process.cwd(), "uploads", req.path);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).json({ message: "File not found" });
      }
    });
  });

  // Notifications routes
  app.get("/api/notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(req.user!.id, limit);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationRead(notificationId);
      res.json({ message: "Notification marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Analytics routes
  app.get("/api/analytics/tasks", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : req.user?.storeId;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const stats = await storage.getTaskStats(storeId, dateFrom, dateTo);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/users", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : req.user?.storeId;
      const stats = await storage.getUserStats(storeId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);

  // WebSocket setup for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "auth" && message.userId) {
          // Store connection with user ID
          wsConnections.set(message.userId, ws);
          ws.send(JSON.stringify({ type: "auth_success" }));
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      // Remove connection when closed
      wsConnections.forEach((connection, userId) => {
        if (connection === ws) {
          wsConnections.delete(userId);
        }
      });
    });
  });

  // Helper function to broadcast task updates
  function broadcastTaskUpdate(task: any) {
    const message = JSON.stringify({
      type: "task_update",
      task,
    });

    // Send to all connected users in the same store
    wsConnections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  return httpServer;
}
