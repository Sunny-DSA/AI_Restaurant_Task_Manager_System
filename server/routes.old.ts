// // server/routes.ts
// import { Router, Request, Response } from "express";
// import { roleEnum, taskStatusEnum, taskPhotos, taskLists, taskTemplates, tasks } from "@shared/schema";
// import { authenticateToken, requireRole } from "./middleware/auth";
// import { requireActiveCheckin } from "./middleware/requireCheckin";
// import { upload } from "./middleware/upload";
// import { withinFence } from "./utils/geo";
// import { storage } from "./storage";
// import { AuthService } from "./services/authService";

// // DB
// import { db } from "./db";
// import { eq, desc } from "drizzle-orm";

// const ENFORCE_GEOFENCE =
//   process.env.ENFORCE_GEOFENCE !== undefined
//     ? process.env.ENFORCE_GEOFENCE === "true"
//     : process.env.NODE_ENV === "production";

// const router = Router();

// /* ============== AUTH ============== */
// router.post("/auth/login", async (req, res) => {
//   try {
//     const { email, password, pin, storeId, rememberMe, latitude, longitude } = req.body ?? {};
//     let user: any;

//     if (email && password) {
//       try {
//         user = await AuthService.authenticateWithEmail(String(email), String(password));
//       } catch (err: any) {
//         const msg = String(err?.message || "").toLowerCase();
//         if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
//         if (msg.includes("invalid password")) return res.status(401).json({ message: "Incorrect password. Please try again." });
//         return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
//       }
//     } else if (pin && storeId) {
//       const store = await storage.getStore(Number(storeId));
//       if (!store) return res.status(404).json({ message: "Store not found." });

//       const hasFence =
//         store.latitude != null && store.longitude != null &&
//         store.geofenceRadius != null && Number(store.geofenceRadius) > 0;

//       if (hasFence && ENFORCE_GEOFENCE) {
//         const lat = Number(latitude), lng = Number(longitude);
//         if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
//           return res.status(400).json({ message: "Location required for store login. Please enable location services and try again." });
//         }
//         const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
//         if (!ok) return res.status(403).json({ message: "Outside store geofence. Please log in inside the store radius." });
//       }

//       try {
//         user = await AuthService.authenticateWithPin(String(pin), Number(storeId));
//       } catch (err: any) {
//         const msg = String(err?.message || "").toLowerCase();
//         if (msg.includes("incorrect pin")) return res.status(401).json({ message: "Incorrect PIN. Please try again." });
//         if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
//         return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
//       }
//     } else {
//       return res.status(400).json({ message: "Please provide valid login details." });
//     }

//     (req.session as any).userId = user.id;
//     (req.session as any).role = user.role;
//     if (rememberMe === true) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

//     return res.json({
//       id: user.id, email: user.email,
//       firstName: user.firstName, lastName: user.lastName,
//       role: user.role, storeId: user.storeId,
//     });
//   } catch {
//     return res.status(500).json({ message: "Unexpected error during login. Please try again." });
//   }
// });

// router.get("/auth/me", authenticateToken, (req, res) => res.json((req as any).user));

// router.post("/auth/logout", (req, res) => {
//   const COOKIE = "sid";
//   try {
//     req.session?.destroy(() => {
//       res.clearCookie(COOKIE);
//       res.status(200).json({ ok: true });
//     });
//   } catch {
//     res.clearCookie(COOKIE);
//     res.status(200).json({ ok: true });
//   }
// });

// /** QR – simple JSON payload {storeId} */
// router.post("/auth/verify-qr", async (req, res) => {
//   try {
//     const { qrData } = req.body ?? {};
//     const payload = JSON.parse(String(qrData));
//     const id = Number(payload?.storeId);
//     if (!id) return res.status(400).json({ message: "Invalid QR" });
//     const store = await storage.getStore(id);
//     if (!store) return res.status(404).json({ message: "Store not found" });
//     res.json({ success: true, storeId: id, storeName: store.name });
//   } catch {
//     res.status(400).json({ message: "Invalid QR" });
//   }
// });

// /** Check-in */
// router.post("/auth/checkin", authenticateToken, async (req: Request, res: Response) => {
//   const user = (req as any).user as { id: number } | undefined;
//   if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

//   const { storeId, latitude, longitude } = req.body ?? {};
//   if (!storeId) return res.status(400).json({ message: "storeId required" });

//   const store = await storage.getStore(Number(storeId));
//   if (!store) return res.status(404).json({ message: "Store not found" });

//   if (store.latitude != null && store.longitude != null && store.geofenceRadius) {
//     const lat = Number(latitude), lng = Number(longitude);
//     if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
//       return res.status(400).json({ message: "Location required for geofenced check-in" });
//     }
//     const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
//     if (!ok) return res.status(403).json({ message: "Outside store geofence" });
//   }

//   const snapshotFence =
//     store.latitude != null && store.longitude != null && store.geofenceRadius
//       ? { lat: Number(store.latitude), lng: Number(store.longitude), radiusM: Number(store.geofenceRadius) }
//       : undefined;

//   (req as any).session.activeCheckin = {
//     storeId: Number(storeId),
//     storeName: store.name,
//     fence: snapshotFence,
//     startedAt: new Date().toISOString(),
//   };
//   if ((storage as any).setActiveCheckin) (storage as any).setActiveCheckin(user.id, (req as any).session.activeCheckin);
//   res.json({ success: true });
// });

// router.post("/auth/checkout", authenticateToken, async (req, res) => {
//   const user = (req as any).user as { id: number } | undefined;
//   if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });
//   (req as any).session.activeCheckin = undefined;
//   if ((storage as any).clearActiveCheckin) (storage as any).clearActiveCheckin(user.id);
//   res.json({ success: true });
// });

// /* ============== USERS ============== */
// router.get("/users", authenticateToken, async (req, res) => {
//   try {
//     const me = (req as any).user!;
//     const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
//     const isAdmin = me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN;

//     const includeMe = async (arr: any[]) => {
//       const meFull = await storage.getUser(me.id);
//       if (meFull && !arr.find((u) => u.id === meFull.id)) arr.push(meFull);
//     };

//     if (isAdmin) {
//       if (qStoreId) {
//         let list: any[] = [];
//         if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(qStoreId);
//         await includeMe(list);
//         return res.json(list || []);
//       }
//       if (typeof (storage as any).getAllUsers === "function") {
//         const all = await (storage as any).getAllUsers();
//         await includeMe(all);
//         return res.json(all || []);
//       }
//       const stores = (await storage.getStores()) || [];
//       const out: any[] = [];
//       for (const s of stores) {
//         if (typeof (storage as any).getUsersByStore === "function") {
//           const list = await (storage as any).getUsersByStore(s.id);
//           for (const u of list || []) if (!out.find((x) => x.id === u.id)) out.push(u);
//         }
//       }
//       await includeMe(out);
//       return res.json(out);
//     }

//     if (me.role === roleEnum.STORE_MANAGER) {
//       if (!me.storeId) {
//         const onlyMe = await storage.getUser(me.id);
//         return res.json(onlyMe ? [onlyMe] : []);
//       }
//       let list: any[] = [];
//       if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(me.storeId);
//       await includeMe(list);
//       return res.json(list || []);
//     }

//     const self = await storage.getUser(me.id);
//     return res.json(self ? [self] : []);
//   } catch (err: any) {
//     res.status(500).json({ message: err?.message || "Failed to fetch users" });
//   }
// });

// router.post(
//   "/users",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const created = await AuthService.createUser(req.body as any, req.body?.password);
//       res.json(created);
//     } catch (err: any) {
//       res.status(400).json({ message: err?.message || "Failed to create user" });
//     }
//   }
// );

// router.put(
//   "/users/:id/pin",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const id = Number(req.params.id);
//       const pin: string = String(req.body?.pin ?? "");
//       if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: "PIN must be exactly 4 digits" });

//       const me = (req as any).user;
//       if (me.role === roleEnum.STORE_MANAGER) {
//         const target = await storage.getUser(id);
//         if (!target) return res.status(404).json({ message: "User not found" });
//         if (target.storeId !== me.storeId) return res.status(403).json({ message: "Forbidden" });
//       }
//       await AuthService.setUserPin(id, pin);
//       return res.json({ success: true });
//     } catch (err: any) {
//       return res.status(400).json({ message: err?.message || "Failed to set PIN" });
//     }
//   }
// );

// /* ============== TASK LISTS & TEMPLATES ============== */
// router.get("/task-lists", authenticateToken, async (_req, res) => {
//   try {
//     const lists = await storage.getTaskLists();
//     res.json(lists || []);
//   } catch (err: any) {
//     res.status(500).json({ message: err?.message || "Failed to fetch task lists" });
//   }
// });

// router.get("/task-lists/:id", authenticateToken, async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const row = await storage.getTaskList(id);
//     if (!row) return res.status(404).json({ message: "Task list not found" });
//     return res.json(row);
//   } catch (err: any) {
//     res.status(500).json({ message: err?.message || "Failed to fetch task list" });
//   }
// });

// router.post(
//   "/task-lists",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const me = (req as any).user!;
//       const b = req.body ?? {};
//       if (me.role === roleEnum.STORE_MANAGER) {
//         if (!me.storeId) return res.status(400).json({ message: "Store assignment required" });
//         if (b.storeId && Number(b.storeId) !== Number(me.storeId)) {
//           return res.status(403).json({ message: "Cannot create lists for another store" });
//         }
//       }
//       const list = await storage.createTaskList({
//         name: b.name ?? b.title,
//         description: b.description ?? null,
//         assigneeType: b.assigneeType ?? "store_wide",
//         assigneeId: b.assigneeId != null ? Number(b.assigneeId) : null,
//         recurrenceType: b.recurrenceType ?? null,
//         recurrencePattern: b.recurrencePattern ?? null,
//         createdBy: me.id,
//         storeId: b.storeId
//           ? Number(b.storeId)
//           : me.role === roleEnum.STORE_MANAGER
//           ? Number(me.storeId)
//           : undefined,
//       });

//       // Do NOT write createdByName/Role to DB columns (can cause Drizzle type error if columns not present).
//       // Return them in the API response only:
//       res.status(201).json({
//         ...list,
//         createdByName: me.firstName ?? null,
//         createdByRole: me.role,
//       });
//     } catch (err: any) {
//       res.status(400).json({ message: err?.message || "Failed to create task list" });
//     }
//   }
// );

// router.put(
//   "/task-lists/:id",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const me = (req as any).user!;
//       const id = Number(req.params.id);
//       const b = req.body ?? {};
//       if (me.role === roleEnum.STORE_MANAGER && b.storeId && Number(b.storeId) !== Number(me.storeId)) {
//         return res.status(403).json({ message: "Cannot assign lists to another store" });
//       }
//       const updated = await storage.updateTaskList(id, {
//         name: b.name ?? b.title,
//         description: b.description,
//         assigneeType: b.assigneeType,
//         assigneeId: b.assigneeId != null ? Number(b.assigneeId) : undefined,
//         recurrenceType: b.recurrenceType,
//         recurrencePattern: b.recurrencePattern,
//         storeId: b.storeId != null ? Number(b.storeId) : undefined,
//       });
//       if (!updated) return res.status(404).json({ message: "Task list not found" });
//       res.json(updated);
//     } catch (err: any) {
//       res.status(400).json({ message: err?.message || "Failed to update task list" });
//     }
//   }
// );

// router.delete(
//   "/task-lists/:id",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const id = Number(req.params.id);
//       const ok = await storage.deleteTaskList(id);
//       if (!ok) return res.status(404).json({ message: "Task list not found" });
//       res.json({ success: true });
//     } catch (err: any) {
//       res.status(400).json({ message: err?.message || "Failed to delete task list" });
//     }
//   }
// );

// router.get("/task-lists/:id/templates", authenticateToken, async (req, res) => {
//   try {
//     const listId = Number(req.params.id);
//     if (typeof (storage as any).getTemplatesByList === "function") {
//       const rows = await (storage as any).getTemplatesByList(listId);
//       return res.json(rows || []);
//     }
//     const all = await storage.getTaskTemplates();
//     return res.json((all || []).filter((t: any) => t.listId === listId && t.isActive !== false));
//   } catch (e: any) {
//     res.status(500).json({ message: e?.message || "Failed to fetch templates" });
//   }
// });

// router.post(
//   "/task-lists/:id/templates",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const listId = Number(req.params.id);
//       const me = (req as any).user!;
//       const b = req.body ?? {};

//       // Create template (idempotency left to caller)
//       const row = await storage.createTaskTemplate({
//         listId,
//         title: String(b.title || "Task"),
//         description: b.description ?? null,
//         storeId: null,
//         createdBy: me.id,
//         recurrenceType: null,
//         recurrencePattern: null,
//         estimatedDuration: null,
//         assigneeType: b.assigneeId ? "specific_employee" : "store_wide",
//         assigneeId: b.assigneeId ?? null,
//         photoRequired: !!b.photoRequired || Number(b.photoCount ?? 0) > 0,
//         photoCount: Number(b.photoCount ?? 0),
//         priority: b.priority ?? "normal",
//         isActive: true,
//       });

//       res.status(201).json(row);
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Failed to create template" });
//     }
//   }
// );

// router.put(
//   "/task-lists/templates/:templateId",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     try {
//       const id = Number(req.params.templateId);
//       const b = req.body ?? {};
//       const patch: any = {};
//       if ("title" in b) patch.title = b.title ?? null;
//       if ("description" in b) patch.description = b.description ?? null;
//       if ("assigneeId" in b) {
//         patch.assigneeId = b.assigneeId ?? null;
//         patch.assigneeType = b.assigneeId ? "specific_employee" : "store_wide";
//       }
//       if ("photoRequired" in b) patch.photoRequired = !!b.photoRequired;
//       if ("photoCount" in b) patch.photoCount = Number(b.photoCount ?? 0);
//       if ("priority" in b) patch.priority = b.priority ?? "normal";

//       const updated = await storage.updateTaskTemplate(id, patch);
//       if (!updated) return res.status(404).json({ message: "Template not found" });
//       res.json(updated);
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Failed to update template" });
//     }
//   }
// );

// /* ============== TASKS CRUD ============== */
// router.get("/tasks/my", authenticateToken, async (req, res) => {
//   const user = (req as any).user!;
//   const rows = await storage.getTasks({ assigneeId: user.id });
//   res.json(rows);
// });

// router.get("/tasks/available", authenticateToken, async (req, res) => {
//   const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
//   if (!storeId) return res.status(400).json({ message: "storeId required" });
//   const rows = await storage.getTasks({ storeId, status: taskStatusEnum.AVAILABLE });
//   res.json(rows);
// });

// router.get("/tasks", authenticateToken, async (req, res) => {
//   const user = (req as any).user!;
//   if (user.role === roleEnum.EMPLOYEE) {
//     const mine = await storage.getTasks({ assigneeId: user.id });
//     return res.json(mine);
//   }
//   if (user.role === roleEnum.STORE_MANAGER) {
//     if (!user.storeId) return res.status(400).json({ message: "Store assignment required" });
//     const rows = await storage.getTasks({ storeId: user.storeId });
//     return res.json(rows);
//   }
//   const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
//   const rows = await storage.getTasks({ storeId });
//   return res.json(rows);
// });

// router.post(
//   "/tasks",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     const user = (req as any).user!;
//     const b = req.body ?? {};
//     if (!b.title || !b.storeId) return res.status(400).json({ message: "title and storeId are required" });
//     if (user.role === roleEnum.STORE_MANAGER && user.storeId !== Number(b.storeId)) {
//       return res.status(403).json({ message: "Cannot create tasks for another store" });
//     }
//     const newTask = await storage.createTask({
//       title: String(b.title),
//       description: b.description ?? null,
//       priority: b.priority ?? "normal",
//       storeId: Number(b.storeId),
//       assigneeType: b.assigneeId ? "specific_employee" : "store_wide",
//       assigneeId: b.assigneeId != null ? Number(b.assigneeId) : null,
//       status: taskStatusEnum.PENDING,
//       dueAt: b.dueAt ? new Date(b.dueAt) : null,
//       scheduledFor: b.scheduledFor ? new Date(b.scheduledFor) : null,
//       estimatedDuration: b.estimatedDuration != null ? Number(b.estimatedDuration) : null,
//       photoRequired: !!b.photoRequired,
//       photoCount: b.photoCount != null ? Number(b.photoCount) : 1,
//       geoLat: b.geoLat != null ? String(b.geoLat) : null,
//       geoLng: b.geoLng != null ? String(b.geoLng) : null,
//       geoRadiusM: b.geoRadiusM != null ? Number(b.geoRadiusM) : null,
//       notes: b.notes ?? null,
//     });
//     res.json(newTask);
//   }
// );

// router.put(
//   "/tasks/:id",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     const user = (req as any).user!;
//     const id = Number(req.params.id);
//     const patch = req.body ?? {};

//     if (user.role === roleEnum.STORE_MANAGER) {
//       const t = await storage.getTask(id);
//       if (t && t.storeId !== user.storeId) return res.status(403).json({ message: "Forbidden" });
//     }

//     const updates: any = {};
//     if ("title" in patch) updates.title = patch.title ?? null;
//     if ("description" in patch) updates.description = patch.description ?? null;
//     if ("priority" in patch) updates.priority = patch.priority ?? "normal";
//     if ("assigneeId" in patch) {
//       updates.assigneeId = patch.assigneeId != null ? Number(patch.assigneeId) : null;
//       updates.assigneeType = patch.assigneeId ? "specific_employee" : "store_wide";
//     }
//     if ("status" in patch) updates.status = patch.status ?? taskStatusEnum.PENDING;
//     if ("dueAt" in patch) updates.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
//     if ("scheduledFor" in patch) updates.scheduledFor = patch.scheduledFor ? new Date(patch.scheduledFor) : null;
//     if ("estimatedDuration" in patch) {
//       updates.estimatedDuration = patch.estimatedDuration != null ? Number(patch.estimatedDuration) : null;
//     }
//     if ("photoRequired" in patch) updates.photoRequired = !!patch.photoRequired;
//     if ("photoCount" in patch) updates.photoCount = Number(patch.photoCount) || 1;
//     if ("geoLat" in patch) updates.geoLat = patch.geoLat != null ? String(patch.geoLat) : null;
//     if ("geoLng" in patch) updates.geoLng = patch.geoLng != null ? String(patch.geoLng) : null;
//     if ("geoRadiusM" in patch) updates.geoRadiusM = patch.geoRadiusM != null ? Number(patch.geoRadiusM) : null;
//     if ("notes" in patch) updates.notes = patch.notes ?? null;

//     const updated = await storage.updateTask(id, updates);
//     res.json(updated);
//   }
// );

// router.delete(
//   "/tasks/:id",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
//   async (req, res) => {
//     const user = (req as any).user!;
//     const id = Number(req.params.id);
//     if (user.role === roleEnum.STORE_MANAGER) {
//       const t = await storage.getTask(id);
//       if (t && t.storeId !== user.storeId) return res.status(403).json({ message: "Forbidden" });
//     }
//     await storage.deleteTask(id);
//     res.json({ success: true });
//   }
// );

// /* ============== PHOTOS & COMPLETE ============== */
// // Store photo as data:URL in DB (no disk writes)
// router.post(
//   "/tasks/:id/photos",
//   authenticateToken,
//   requireActiveCheckin,
//   upload.single("photo"),
//   async (req, res) => {
//     try {
//       const id = Number(req.params.id);
//       const user = (req as any).user!;
//       const lat = req.body?.latitude != null ? Number(req.body.latitude) : undefined;
//       const lng = req.body?.longitude != null ? Number(req.body.longitude) : undefined;
//       const point = lat != null && lng != null ? { lat, lng } : undefined;

//       const task = await storage.getTask(id);
//       if (!task) return res.status(404).json({ message: "Task not found" });

//       // photo limit
//       const need = Number(task.photoCount ?? 0);
//       const have = Number(task.photosUploaded ?? 0);
//       if (need > 0 && have >= need) {
//         return res.status(400).json({ message: "Photo limit reached for this task." });
//       }

//       // employee restriction
//       if (user.role === roleEnum.EMPLOYEE && task.assigneeId && task.assigneeId !== user.id) {
//         return res.status(403).json({ message: "You can only upload for your assigned task" });
//       }

//       // geofence check from active check-in
//       const activeCheckin = (req as any).activeCheckin as { fence?: { lat: number; lng: number; radiusM: number } };
//       const fence = activeCheckin?.fence;
//       if (fence && (!point || !withinFence(point, { lat: fence.lat, lng: fence.lng }, fence.radiusM))) {
//         return res.status(403).json({ message: "You must be on store premises to upload photos." });
//       }

//       const f = req.file as Express.Multer.File | undefined;
//       if (!f) return res.status(400).json({ message: "No photo uploaded" });

//       const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;

//       // Keep insert minimal to avoid Drizzle type errors on optional columns
//       await db.insert(taskPhotos).values({
//         taskId: id,
//         filename: f.originalname || "upload",
//         mimeType: f.mimetype,
//         fileSize: f.size,
//         url: dataUrl,
//         uploadedBy: user.id,
//       } as any);

//       const newCount = have + 1;
//       await storage.updateTask(id, { photosUploaded: newCount });

//       res.json({ success: true, photosUploaded: newCount, photoCount: need });
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Upload failed" });
//     }
//   }
// );

// router.post(
//   "/tasks/:id/complete",
//   authenticateToken,
//   requireActiveCheckin,
//   async (req, res) => {
//     try {
//       const id = Number(req.params.id);
//       const user = (req as any).user!;
//       const { latitude, longitude, overridePhotoRequirement, notes } = req.body ?? {};
//       const task = await storage.getTask(id);
//       if (!task) return res.status(404).json({ message: "Task not found" });

//       if (user.role === roleEnum.EMPLOYEE) {
//         if (task.assigneeId && task.assigneeId !== user.id) return res.status(403).json({ message: "Not your task" });
//         const need = task.photoCount ?? 1;
//         const have = task.photosUploaded ?? 0;
//         if (task.photoRequired && have < need && !overridePhotoRequirement) {
//           return res.status(400).json({ message: "Photo required before completion" });
//         }
//       }

//       const point =
//         typeof latitude === "number" && typeof longitude === "number"
//           ? { lat: Number(latitude), lng: Number(longitude) }
//           : undefined;

//       const activeCheckin = (req as any).activeCheckin as { fence?: { lat: number; lng: number; radiusM: number } };
//       const taskFence = activeCheckin?.fence;
//       if (taskFence) {
//         if (!point || !withinFence(point, { lat: taskFence.lat, lng: taskFence.lng }, taskFence.radiusM)) {
//           return res.status(403).json({ message: "Completion must occur on store premises." });
//         }
//       }

//       const updated = await storage.updateTask(id, {
//         status: taskStatusEnum.COMPLETED,
//         completedAt: new Date(),
//         completedBy: user.id,
//         notes: notes ?? task.notes ?? null,
//       });

//       res.json({ success: true, task: updated });
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Completion failed" });
//     }
//   }
// );

// /* Serve photo bytes from stored data:URL (keeps existing /api/photos/:id usage working) */
// router.get("/photos/:id", authenticateToken, async (req, res) => {
//   const id = Number(req.params.id);
//   if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

//   const [row] = await db
//     .select({ url: taskPhotos.url })
//     .from(taskPhotos)
//     .where(eq(taskPhotos.id, id))
//     .limit(1);

//   const dataUrl = row?.url || "";
//   if (!dataUrl.startsWith("data:")) return res.status(404).json({ message: "Not found" });

//   const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
//   if (!m) return res.status(500).json({ message: "Invalid image data" });

//   const mime = m[1];
//   const b64 = m[2];
//   res.setHeader("Content-Type", mime || "image/jpeg");
//   res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
//   res.end(Buffer.from(b64, "base64"));
// });

// /* ============== STORES ============== */
// router.get("/stores", authenticateToken, async (req, res) => {
//   try {
//     const user = (req as any).user;
//     if (user.role === roleEnum.MASTER_ADMIN || user.role === roleEnum.ADMIN) {
//       const stores = await storage.getStores();
//       return res.json(stores || []);
//     } else if (user.storeId) {
//       const store = await storage.getStore(user.storeId);
//       return res.json(store ? [store] : []);
//     }
//     return res.json([]);
//   } catch (err: any) {
//     res.status(500).json({ message: err?.message || "Failed to fetch stores" });
//   }
// });

// router.get("/stores/:id", authenticateToken, async (req, res) => {
//   try {
//     const storeId = Number(req.params.id);
//     const user = (req as any).user;
//     if (user.role !== roleEnum.MASTER_ADMIN && user.role !== roleEnum.ADMIN && user.storeId !== storeId) {
//       return res.status(403).json({ message: "Unauthorized to view this store" });
//     }
//     const store = await storage.getStore(storeId);
//     if (!store) return res.status(404).json({ message: "Store not found" });
//     res.json(store);
//   } catch (err: any) {
//     res.status(500).json({ message: err?.message || "Failed to fetch store" });
//   }
// });

// router.post(
//   "/stores",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
//   async (req, res) => {
//     try {
//       const storeData = req.body;
//       const newStore = await storage.createStore(storeData);
//       res.status(201).json(newStore);
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Failed to create store" });
//     }
//   }
// );

// router.put(
//   "/stores/:id",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
//   async (req, res) => {
//     try {
//       const storeId = Number(req.params.id);
//       const updates = req.body;
//       const updatedStore = await storage.updateStore(storeId, updates);
//       if (!updatedStore) return res.status(404).json({ message: "Store not found" });
//       res.json(updatedStore);
//     } catch (err: any) {
//       res.status(500).json({ message: err?.message || "Failed to update store" });
//     }
//   }
// );

// router.get(
//   "/admin/task-previews",
//   authenticateToken,
//   requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
//   async (req, res) => {
//     const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;

//     // Select most recent 50 uploads; return data URLs for direct <img src="...">
//     const base = db
//       .select({
//         photoId: taskPhotos.id,
//         uploadedAt: taskPhotos.uploadedAt,
//         filename: taskPhotos.filename,
//         mimeType: taskPhotos.mimeType,
//         url: taskPhotos.url,
//         uploadedBy: taskPhotos.uploadedBy,
//         taskId: tasks.id,
//         storeId: tasks.storeId,
//         templateId: taskTemplates.id,
//         listId: taskLists.id,
//         listName: taskLists.name,
//       })
//       .from(taskPhotos)
//       .leftJoin(tasks, eq(taskPhotos.taskId, tasks.id))
//       .leftJoin(taskTemplates, eq(tasks.templateId, taskTemplates.id))
//       .leftJoin(taskLists, eq(taskTemplates.listId, taskLists.id));

//     const q = qStoreId ? base.where(eq(tasks.storeId, qStoreId)) : base;
//     const rows = await q.orderBy(desc(taskPhotos.uploadedAt)).limit(50);
//     res.json(rows);
//   }
// );

// export default router;
