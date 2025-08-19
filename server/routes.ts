import express, { type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import { Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./services/authService";
import { StoreService } from "./services/storeService";
import { TaskService } from "./services/taskService";
import { authenticateToken } from "./middleware/auth";

// Extend the session interface to include user
declare module 'express-session' {
  interface SessionData {
    userId: number;
    user: any;
  }
}

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

  // =========================
  // Authentication Routes
  // =========================
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, pin, storeId } = req.body;

      let user;
      if (email && password) {
        user = await AuthService.authenticateWithEmail(email, password);
      } else if (pin && storeId) {
        user = await AuthService.authenticateWithPin(pin, storeId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid login credentials provided"
        });
      }

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

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // =========================
  // QR Code Verification
  // =========================
  app.post("/api/auth/verify-qr", async (req: Request, res: Response) => {
    try {
      const { qrData } = req.body;
      if (!qrData) {
        return res.status(400).json({ success: false, message: "QR data is required" });
      }

      const verification = await StoreService.verifyQRCode(qrData);
      if (!verification.isValid) {
        return res.status(400).json({ success: false, message: "Invalid or expired QR code" });
      }

      res.json({
        success: true,
        storeId: verification.storeId,
        employeeId: verification.employeeId,
      });
    } catch (error) {
      console.error('QR verification error:', error);
      res.status(500).json({ success: false, message: "QR verification failed" });
    }
  });

  // =========================
  // Task Routes
  // =========================
  app.get("/api/tasks/my", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tasks = await TaskService.getTasksForUser(req.user.id, req.user.storeId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId, status, assigneeId, claimedBy } = req.query;
      const tasks = await storage.getTasks({
        storeId: storeId ? Number(storeId) : undefined,
        status: status as string,
        assigneeId: assigneeId ? Number(assigneeId) : undefined,
        claimedBy: claimedBy ? Number(claimedBy) : undefined
      });
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks/available", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const userStoreId = storeId ? Number(storeId) : req.user.storeId;

      if (!userStoreId) {
        return res.status(400).json({ message: "Store ID is required" });
      }

      const tasks = await TaskService.getAvailableTasks(userStoreId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskData = req.body;
      const task = await TaskService.createTask(taskData);
      res.status(201).json(task);
    } catch (error: any) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: error.message || "Failed to create task" });
    }
  });

  app.post("/api/tasks/from-template", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { templateId, storeId, scheduledFor, assigneeType, assigneeId } = req.body;
      const task = await TaskService.createTaskFromTemplate(
        templateId,
        storeId,
        new Date(scheduledFor),
        assigneeType,
        assigneeId
      );
      res.status(201).json(task);
    } catch (error: any) {
      console.error("Error creating task from template:", error);
      res.status(500).json({ message: error.message || "Failed to create task from template" });
    }
  });

  app.put("/api/tasks/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updatedTask = await storage.updateTask(id, updates);
      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: error.message || "Failed to update task" });
    }
  });

  app.post("/api/tasks/:id/claim", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      const { latitude, longitude } = req.body;
      const task = await TaskService.claimTask(taskId, req.user.id, latitude, longitude);
      res.json(task);
    } catch (error: any) {
      console.error("Error claiming task:", error);
      res.status(500).json({ message: error.message || "Failed to claim task" });
    }
  });

  app.post("/api/tasks/:id/transfer", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      const { toUserId, reason } = req.body;
      const transfer = await TaskService.transferTask(taskId, req.user.id, toUserId, reason);
      res.json(transfer);
    } catch (error: any) {
      console.error("Error transferring task:", error);
      res.status(500).json({ message: error.message || "Failed to transfer task" });
    }
  });

  app.post("/api/tasks/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      const { notes } = req.body;
      const task = await TaskService.completeTask(taskId, req.user.id, notes);
      res.json(task);
    } catch (error: any) {
      console.error("Error completing task:", error);
      res.status(500).json({ message: error.message || "Failed to complete task" });
    }
  });

  app.post("/api/tasks/:id/start", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      const task = await TaskService.updateTaskProgress(taskId, req.user.id);
      res.json(task);
    } catch (error: any) {
      console.error("Error starting task:", error);
      res.status(500).json({ message: error.message || "Failed to start task" });
    }
  });

  // =========================
  // Store Routes
  // =========================
  app.get("/api/stores", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stores = await storage.getStores();
      res.json(stores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/stores", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user.role !== "MASTER_ADMIN") {
        return res.status(403).json({ message: "Only Master Admin can create stores" });
      }

      const storeData = req.body;
      const store = await StoreService.createStore(storeData);
      res.status(201).json(store);
    } catch (error: any) {
      console.error("Error creating store:", error);
      res.status(500).json({ message: error.message || "Failed to create store" });
    }
  });

  app.put("/api/stores/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user.role !== "MASTER_ADMIN") {
        return res.status(403).json({ message: "Only Master Admin can update stores" });
      }

      const id = Number(req.params.id);
      const updates = req.body;
      const updatedStore = await storage.updateStore(id, updates);
      res.json(updatedStore);
    } catch (error: any) {
      console.error("Error updating store:", error);
      res.status(500).json({ message: error.message || "Failed to update store" });
    }
  });

  app.delete("/api/stores/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user.role !== "MASTER_ADMIN") {
        return res.status(403).json({ message: "Only Master Admin can delete stores" });
      }

      const id = Number(req.params.id);
      // Soft delete by setting isActive to false
      await storage.updateStore(id, { isActive: false });
      res.json({ message: "Store deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting store:", error);
      res.status(500).json({ message: error.message || "Failed to delete store" });
    }
  });

  // =========================
  // User Routes
  // =========================
  app.get("/api/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const users = await storage.getActiveUsers(storeId ? Number(storeId) : undefined);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // =========================
  // Analytics Routes
  // =========================
  app.get("/api/analytics/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId, dateFrom, dateTo } = req.query;
      const stats = await storage.getTaskStats(
        storeId ? Number(storeId) : undefined,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const stats = await storage.getUserStats(storeId ? Number(storeId) : undefined);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // =========================
  // Task Template Routes
  // =========================
  app.get("/api/task-templates", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { storeId } = req.query;
      const templates = await storage.getTaskTemplates(storeId ? Number(storeId) : undefined);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/task-templates", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const templateData = req.body;
      const template = await storage.createTaskTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating task template:", error);
      res.status(500).json({ message: error.message || "Failed to create task template" });
    }
  });

  app.put("/api/task-templates/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updatedTemplate = await storage.updateTaskTemplate(id, updates);
      res.json(updatedTemplate);
    } catch (error: any) {
      console.error("Error updating task template:", error);
      res.status(500).json({ message: error.message || "Failed to update task template" });
    }
  });

  // =========================
  // Task Items Routes
  // =========================
  app.get("/api/tasks/:taskId/items", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.taskId);
      const items = await storage.getTaskItems(taskId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:taskId/items", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.taskId);
      const itemData = {
        ...req.body,
        taskId
      };
      const item = await storage.createTaskItem(itemData);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating task item:", error);
      res.status(500).json({ message: error.message || "Failed to create task item" });
    }
  });

  app.put("/api/task-items/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updatedItem = await storage.updateTaskItem(id, updates);
      res.json(updatedItem);
    } catch (error: any) {
      console.error("Error updating task item:", error);
      res.status(500).json({ message: error.message || "Failed to update task item" });
    }
  });

  // =========================
  // Task Photos Routes
  // =========================
  app.get("/api/tasks/:taskId/photos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.taskId);
      const photos = await storage.getTaskPhotos(taskId);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:taskId/photos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.taskId);
      const photoData = {
        ...req.body,
        taskId,
        uploadedBy: req.user.id
      };
      const photo = await storage.createTaskPhoto(photoData);
      res.status(201).json(photo);
    } catch (error: any) {
      console.error("Error uploading task photo:", error);
      res.status(500).json({ message: error.message || "Failed to upload photo" });
    }
  });

  // =========================
  // Task Lists Routes
  // =========================
  app.get("/api/task-lists", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const lists = await storage.getTaskLists();
      res.json(lists);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/task-lists", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const listData = {
        ...req.body,
        createdBy: req.user.id
      };
      const list = await storage.createTaskList(listData);
      res.status(201).json(list);
    } catch (error: any) {
      console.error("Error creating task list:", error);
      res.status(500).json({ message: error.message || "Failed to create task list" });
    }
  });

  app.put("/api/task-lists/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updatedList = await storage.updateTaskList(id, updates);
      res.json(updatedList);
    } catch (error: any) {
      console.error("Error updating task list:", error);
      res.status(500).json({ message: error.message || "Failed to update task list" });
    }
  });

  app.delete("/api/task-lists/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteTaskList(id);
      res.json({ message: "Task list deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting task list:", error);
      res.status(500).json({ message: error.message || "Failed to delete task list" });
    }
  });

  app.post("/api/task-lists/:id/duplicate", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const duplicatedList = await storage.duplicateTaskList(id, req.user.id);
      res.status(201).json(duplicatedList);
    } catch (error: any) {
      console.error("Error duplicating task list:", error);
      res.status(500).json({ message: error.message || "Failed to duplicate task list" });
    }
  });

  // =========================
  // Check-in Routes
  // =========================
  app.get("/api/checkins/active", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const checkIn = await storage.getActiveCheckIn(req.user.id);
      res.json(checkIn);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/checkins", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const checkInData = {
        ...req.body,
        userId: req.user.id
      };
      const checkIn = await storage.createCheckIn(checkInData);
      res.status(201).json(checkIn);
    } catch (error: any) {
      console.error("Error creating check-in:", error);
      res.status(500).json({ message: error.message || "Failed to check in" });
    }
  });

  app.put("/api/checkins/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const updatedCheckIn = await storage.updateCheckIn(id, updates);
      res.json(updatedCheckIn);
    } catch (error: any) {
      console.error("Error updating check-in:", error);
      res.status(500).json({ message: error.message || "Failed to update check-in" });
    }
  });

  // =========================
  // Notification Routes
  // =========================
  app.get("/api/notifications", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit } = req.query;
      const notifications = await storage.getNotifications(
        req.user.id,
        limit ? Number(limit) : undefined
      );
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/notifications/:id/read", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await storage.markNotificationRead(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: error.message || "Failed to mark notification as read" });
    }
  });

  // =========================
  // Global Error Handler
  // =========================
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      message: err.message || "Internal server error",
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  });

  const server = new Server(app);
  return server;
}