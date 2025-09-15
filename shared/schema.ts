// shared/schema.ts
import {
  pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb, index, customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { z } from "zod";

const pgBytea = customType<{ data: Buffer | Uint8Array; driverData: Buffer | Uint8Array }>({
  dataType() { return "bytea"; },
});

export const roleEnum = { MASTER_ADMIN:"master_admin", ADMIN:"admin", STORE_MANAGER:"store_manager", EMPLOYEE:"employee" } as const;
export const taskStatusEnum = { PENDING:"pending", AVAILABLE:"available", CLAIMED:"claimed", IN_PROGRESS:"in_progress", COMPLETED:"completed", OVERDUE:"overdue" } as const;

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (t)=>[index("IDX_session_expire").on(t.expire)]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default(roleEnum.EMPLOYEE),
  pin: text("pin"),
  passwordHash: text("password_hash"),
  storeId: integer("store_id"),
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  timezone: text("timezone").default("UTC"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  geofenceRadius: integer("geofence_radius").default(100),
  qrCode: text("qr_code"),
  qrCodeSecret: text("qr_code_secret"),
  qrCodeExpiresAt: timestamp("qr_code_expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskLists = pgTable("task_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  createdByName: text("created_by_name"),
  createdByRole: text("created_by_role"),
  recurrenceType: text("recurrence_type"),
  recurrencePattern: text("recurrence_pattern"),
  assigneeType: text("assignee_type").notNull().default("store_wide"),
  assigneeId: integer("assignee_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  listId: integer("list_id"),
  title: text("title").notNull(),
  description: text("description"),
  storeId: integer("store_id"),
  createdBy: integer("created_by").notNull(),
  recurrenceType: text("recurrence_type"),
  recurrencePattern: text("recurrence_pattern"),
  estimatedDuration: integer("estimated_duration"),
  photoRequired: boolean("photo_required").default(false),
  photoCount: integer("photo_count").default(1),
  assigneeType: text("assignee_type").notNull().default("store_wide"),
  assigneeId: integer("assignee_id"),
  priority: text("priority").default("normal"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const storeAssignments = pgTable("store_assignments", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  storeId: integer("store_id").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id"),
  storeId: integer("store_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeType: text("assignee_type").notNull(),
  assigneeId: integer("assignee_id"),
  claimedBy: integer("claimed_by"),
  completedBy: integer("completed_by"),
  status: text("status").notNull().default(taskStatusEnum.PENDING),
  priority: text("priority").default("normal"),
  scheduledFor: timestamp("scheduled_for"),
  dueAt: timestamp("due_at"),
  claimedAt: timestamp("claimed_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedDuration: integer("estimated_duration"),
  actualDuration: integer("actual_duration"),
  photoRequired: boolean("photo_required").default(false),
  photoCount: integer("photo_count").default(1),
  photosUploaded: integer("photos_uploaded").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskItems = pgTable("task_items", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  templateId: integer("template_id"),
  title: text("title").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").default(false),
  photoRequired: boolean("photo_required").default(false),
  photoUrl: text("photo_url"),
  completedBy: integer("completed_by"),
  completedByName: text("completed_by_name"),
  completedByRole: text("completed_by_role"),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").default(0),
});

export const taskPhotos = pgTable("task_photos", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  taskItemId: integer("task_item_id"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  url: text("url"),
  data: pgBytea("data"),
  thumbData: pgBytea("thumb_data"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  uploadedBy: integer("uploaded_by").notNull(),
  uploadedByName: text("uploaded_by_name"),
  uploadedByRole: text("uploaded_by_role"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const taskTransfers = pgTable("task_transfers", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  reason: text("reason"),
  transferredAt: timestamp("transferred_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const checkIns = pgTable("check_ins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  checkedInAt: timestamp("checked_in_at").defaultNow(),
  checkedOutAt: timestamp("checked_out_at"),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, { fields: [users.storeId], references: [stores.id] }),
  assignedTasks: many(tasks, { relationName: "assignedTasks" }),
  claimedTasks: many(tasks, { relationName: "claimedTasks" }),
  completedTasks: many(tasks, { relationName: "completedTasks" }),
  checkIns: many(checkIns),
  notifications: many(notifications),
}));
export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  tasks: many(tasks),
  templates: many(taskTemplates),
}));
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  store: one(stores, { fields: [tasks.storeId], references: [stores.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id], relationName: "assignedTasks" }),
  claimedByUser: one(users, { fields: [tasks.claimedBy], references: [users.id], relationName: "claimedTasks" }),
  completedByUser: one(users, { fields: [tasks.completedBy], references: [users.id], relationName: "completedTasks" }),
  items: many(taskItems),
  photos: many(taskPhotos),
  transfers: many(taskTransfers),
}));
export const taskListsRelations = relations(taskLists, ({ one, many }) => ({
  createdBy: one(users, { fields: [taskLists.createdBy], references: [users.id] }),
  assignee: one(users, { fields: [taskLists.assigneeId], references: [users.id] }),
  templates: many(taskTemplates),
  storeAssignments: many(storeAssignments),
}));
export const taskTemplatesRelations = relations(taskTemplates, ({ one, many }) => ({
  list: one(taskLists, { fields: [taskTemplates.listId], references: [taskLists.id] }),
  store: one(stores, { fields: [taskTemplates.storeId], references: [stores.id] }),
  items: many(taskItems),
}));
export const taskItemsRelations = relations(taskItems, ({ one }) => ({
  task: one(tasks, { fields: [taskItems.taskId], references: [tasks.id] }),
}));
export const taskPhotosRelations = relations(taskPhotos, ({ one }) => ({
  task: one(tasks, { fields: [taskPhotos.taskId], references: [tasks.id] }),
}));
export const taskTransfersRelations = relations(taskTransfers, ({ one }) => ({
  task: one(tasks, { fields: [taskTransfers.taskId], references: [tasks.id] }),
}));
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
export const checkInsRelations = relations(checkIns, ({ one }) => ({
  user: one(users, { fields: [checkIns.userId], references: [users.id] }),
  store: one(stores, { fields: [checkIns.storeId], references: [stores.id] }),
}));

export const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365).optional().default(1),
  count: z.number().int().min(1).max(365).optional().default(1),
});
export const loginSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  pin: z.string().length(4).optional(),
  storeId: z.number().optional(),
  rememberMe: z.boolean().optional(),
});
export const createStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  geofenceRadius: z.number().min(50).max(2000).optional(),
});
export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  storeId: z.number(),
  assigneeId: z.number().optional(),
  priority: z.enum(["low","medium","high"]).optional(),
  photoRequired: z.boolean().optional(),
  photoCount: z.number().min(1).max(10).optional(),
  scheduledFor: z.union([z.string(), z.date()]).optional(),
  dueAt: z.union([z.string(), z.date()]).optional(),
  recurrence: recurrenceSchema.optional(),
});
export const uploadPhotoSchema = z.object({
  taskId: z.number(),
  taskItemId: z.number().optional(),
  filename: z.string(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  url: z.string().url().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
export const completeTaskItemSchema = z.object({
  taskItemId: z.number(),
  photoUrl: z.string().url().optional(),
});
export const transferTaskSchema = z.object({
  taskId: z.number(),
  toUserId: z.number(),
  reason: z.string().optional(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;
export type TaskList = typeof taskLists.$inferSelect;
export type InsertTaskList = typeof taskLists.$inferInsert;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = typeof taskTemplates.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type TaskItem = typeof taskItems.$inferSelect;
export type InsertTaskItem = typeof taskItems.$inferInsert;
export type TaskPhoto = typeof taskPhotos.$inferSelect;
export type InsertTaskPhoto = typeof taskPhotos.$inferInsert;
export type TaskTransfer = typeof taskTransfers.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = typeof checkIns.$inferInsert;
