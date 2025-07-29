import { 
  pgTable, 
  text, 
  serial, 
  integer, 
  boolean, 
  timestamp, 
  decimal,
  uuid,
  jsonb,
  index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// User roles enum
export const roleEnum = {
  MASTER_ADMIN: 'master_admin',
  ADMIN: 'admin', 
  STORE_MANAGER: 'store_manager',
  EMPLOYEE: 'employee'
} as const;

// Task status enum
export const taskStatusEnum = {
  PENDING: 'pending',
  AVAILABLE: 'available',
  CLAIMED: 'claimed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue'
} as const;

// Session storage table (required for auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default(roleEnum.EMPLOYEE),
  pin: text("pin"), // 4-digit PIN for store roles
  passwordHash: text("password_hash"), // For admin roles
  storeId: integer("store_id"),
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stores table
export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  timezone: text("timezone").default("UTC"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  geofenceRadius: integer("geofence_radius").default(100), // meters
  qrCode: text("qr_code"),
  qrCodeSecret: text("qr_code_secret"),
  qrCodeExpiresAt: timestamp("qr_code_expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task Lists for grouping related tasks
export const taskLists = pgTable("task_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  recurrenceType: text("recurrence_type"), // daily, weekly, monthly, custom, none
  recurrencePattern: text("recurrence_pattern"), // cron expression for custom
  assigneeType: text("assignee_type").notNull().default("store_wide"), // store_wide, manager, specific_employee
  assigneeId: integer("assignee_id"), // user ID if specific assignment
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task templates/checklists
export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  listId: integer("list_id"), // optional: if part of a task list
  title: text("title").notNull(),
  description: text("description"),
  storeId: integer("store_id"),
  createdBy: integer("created_by").notNull(),
  recurrenceType: text("recurrence_type"), // daily, weekly, monthly, custom, none
  recurrencePattern: text("recurrence_pattern"), // cron expression for custom
  estimatedDuration: integer("estimated_duration"), // minutes
  photoRequired: boolean("photo_required").default(false),
  photoCount: integer("photo_count").default(1),
  assigneeType: text("assignee_type").notNull().default("store_wide"), // store_wide, manager, specific_employee
  assigneeId: integer("assignee_id"), // user ID if specific assignment
  priority: text("priority").default("normal"), // low, normal, high
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Store assignments for templates and lists
export const storeAssignments = pgTable("store_assignments", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'template' or 'list'
  entityId: integer("entity_id").notNull(),
  storeId: integer("store_id").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual task instances
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id"),
  storeId: integer("store_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeType: text("assignee_type").notNull(), // store_wide, manager, specific_employee
  assigneeId: integer("assignee_id"), // user ID if specific assignment
  claimedBy: integer("claimed_by"), // user who claimed the task
  completedBy: integer("completed_by"), // user who completed the task
  status: text("status").notNull().default(taskStatusEnum.PENDING),
  priority: text("priority").default("normal"), // low, normal, high
  scheduledFor: timestamp("scheduled_for"),
  dueAt: timestamp("due_at"),
  claimedAt: timestamp("claimed_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedDuration: integer("estimated_duration"),
  actualDuration: integer("actual_duration"), // minutes
  photoRequired: boolean("photo_required").default(false),
  photoCount: integer("photo_count").default(1),
  photosUploaded: integer("photos_uploaded").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task subtasks/checklist items
export const taskItems = pgTable("task_items", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  templateId: integer("template_id"), // reference to template item
  title: text("title").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").default(false),
  photoRequired: boolean("photo_required").default(false),
  photoUrl: text("photo_url"),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").default(0),
});

// Task photos
export const taskPhotos = pgTable("task_photos", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  taskItemId: integer("task_item_id"), // optional, for specific subtask
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  uploadedBy: integer("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Task transfers/handoffs
export const taskTransfers = pgTable("task_transfers", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  reason: text("reason"),
  transferredAt: timestamp("transferred_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // task_assigned, task_completed, task_overdue, etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"), // additional metadata
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User check-ins
export const checkIns = pgTable("check_ins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  checkedInAt: timestamp("checked_in_at").defaultNow(),
  checkedOutAt: timestamp("checked_out_at"),
});

// Inventory Categories
export const inventoryCategories = pgTable("inventory_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory Items
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: integer("category_id").notNull(),
  sku: text("sku").unique(),
  unit: text("unit").notNull(), // pieces, kg, liters, etc.
  minimumStock: integer("minimum_stock").default(0),
  maximumStock: integer("maximum_stock"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  supplier: text("supplier"),
  expirationDays: integer("expiration_days"), // days until expiration
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Store Inventory (current stock levels per store)
export const storeInventory = pgTable("store_inventory", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  itemId: integer("item_id").notNull(),
  currentStock: integer("current_stock").default(0),
  reservedStock: integer("reserved_stock").default(0), // stock allocated but not used
  lastStockCheck: timestamp("last_stock_check"),
  lastStockCheckBy: integer("last_stock_check_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory Transactions (stock movements)
export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  itemId: integer("item_id").notNull(),
  transactionType: text("transaction_type").notNull(), // in, out, adjustment, waste, transfer
  quantity: integer("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  reason: text("reason"),
  referenceId: text("reference_id"), // PO number, task ID, etc.
  performedBy: integer("performed_by").notNull(),
  performedAt: timestamp("performed_at").defaultNow(),
  notes: text("notes"),
});

// Stock Alerts
export const stockAlerts = pgTable("stock_alerts", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  itemId: integer("item_id").notNull(),
  alertType: text("alert_type").notNull(), // low_stock, out_of_stock, overstocked, expiring_soon
  alertLevel: text("alert_level").notNull(), // info, warning, critical
  currentStock: integer("current_stock"),
  threshold: integer("threshold"),
  message: text("message").notNull(),
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  assignedTasks: many(tasks, { relationName: "assignedTasks" }),
  claimedTasks: many(tasks, { relationName: "claimedTasks" }),
  completedTasks: many(tasks, { relationName: "completedTasks" }),
  checkIns: many(checkIns),
  notifications: many(notifications),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  tasks: many(tasks),
  taskTemplates: many(taskTemplates),
  checkIns: many(checkIns),
  storeAssignments: many(storeAssignments),
  storeInventory: many(storeInventory),
  inventoryTransactions: many(inventoryTransactions),
  stockAlerts: many(stockAlerts),
}));

export const storeAssignmentsRelations = relations(storeAssignments, ({ one }) => ({
  store: one(stores, {
    fields: [storeAssignments.storeId],
    references: [stores.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  template: one(taskTemplates, {
    fields: [tasks.templateId],
    references: [taskTemplates.id],
  }),
  store: one(stores, {
    fields: [tasks.storeId],
    references: [stores.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "assignedTasks",
  }),
  claimedBy: one(users, {
    fields: [tasks.claimedBy],
    references: [users.id],
    relationName: "claimedTasks",
  }),
  completedBy: one(users, {
    fields: [tasks.completedBy],
    references: [users.id],
    relationName: "completedTasks",
  }),
  items: many(taskItems),
  photos: many(taskPhotos),
  transfers: many(taskTransfers),
}));

export const taskListsRelations = relations(taskLists, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [taskLists.createdBy],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [taskLists.assigneeId],
    references: [users.id],
  }),
  templates: many(taskTemplates),
  storeAssignments: many(storeAssignments),
}));

export const taskTemplatesRelations = relations(taskTemplates, ({ one, many }) => ({
  list: one(taskLists, {
    fields: [taskTemplates.listId],
    references: [taskLists.id],
  }),
  store: one(stores, {
    fields: [taskTemplates.storeId],
    references: [stores.id],
  }),
  createdBy: one(users, {
    fields: [taskTemplates.createdBy],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [taskTemplates.assigneeId],
    references: [users.id],
  }),
  tasks: many(tasks),
  storeAssignments: many(storeAssignments),
}));

export const taskItemsRelations = relations(taskItems, ({ one }) => ({
  task: one(tasks, {
    fields: [taskItems.taskId],
    references: [tasks.id],
  }),
}));

export const taskPhotosRelations = relations(taskPhotos, ({ one }) => ({
  task: one(tasks, {
    fields: [taskPhotos.taskId],
    references: [tasks.id],
  }),
  taskItem: one(taskItems, {
    fields: [taskPhotos.taskItemId],
    references: [taskItems.id],
  }),
  uploadedBy: one(users, {
    fields: [taskPhotos.uploadedBy],
    references: [users.id],
  }),
}));

export const taskTransfersRelations = relations(taskTransfers, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTransfers.taskId],
    references: [tasks.id],
  }),
  fromUser: one(users, {
    fields: [taskTransfers.fromUserId],
    references: [users.id],
  }),
  toUser: one(users, {
    fields: [taskTransfers.toUserId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const checkInsRelations = relations(checkIns, ({ one }) => ({
  user: one(users, {
    fields: [checkIns.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [checkIns.storeId],
    references: [stores.id],
  }),
}));

// Inventory Relations
export const inventoryCategoriesRelations = relations(inventoryCategories, ({ many }) => ({
  items: many(inventoryItems),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  category: one(inventoryCategories, {
    fields: [inventoryItems.categoryId],
    references: [inventoryCategories.id],
  }),
  storeInventory: many(storeInventory),
  transactions: many(inventoryTransactions),
  alerts: many(stockAlerts),
}));

export const storeInventoryRelations = relations(storeInventory, ({ one }) => ({
  store: one(stores, {
    fields: [storeInventory.storeId],
    references: [stores.id],
  }),
  item: one(inventoryItems, {
    fields: [storeInventory.itemId],
    references: [inventoryItems.id],
  }),
  lastStockCheckBy: one(users, {
    fields: [storeInventory.lastStockCheckBy],
    references: [users.id],
  }),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  store: one(stores, {
    fields: [inventoryTransactions.storeId],
    references: [stores.id],
  }),
  item: one(inventoryItems, {
    fields: [inventoryTransactions.itemId],
    references: [inventoryItems.id],
  }),
  performedBy: one(users, {
    fields: [inventoryTransactions.performedBy],
    references: [users.id],
  }),
}));

export const stockAlertsRelations = relations(stockAlerts, ({ one }) => ({
  store: one(stores, {
    fields: [stockAlerts.storeId],
    references: [stores.id],
  }),
  item: one(inventoryItems, {
    fields: [stockAlerts.itemId],
    references: [inventoryItems.id],
  }),
  resolvedBy: one(users, {
    fields: [stockAlerts.resolvedBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrCode: true,
  qrCodeSecret: true,
  qrCodeExpiresAt: true,
});

export const insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  claimedAt: true,
  startedAt: true,
  completedAt: true,
  actualDuration: true,
  photosUploaded: true,
});

export const insertTaskItemSchema = createInsertSchema(taskItems).omit({
  id: true,
  isCompleted: true,
  photoUrl: true,
  completedAt: true,
});

export const insertTaskPhotoSchema = createInsertSchema(taskPhotos).omit({
  id: true,
  uploadedAt: true,
});

export const insertCheckInSchema = createInsertSchema(checkIns).omit({
  id: true,
  checkedInAt: true,
});

export const insertInventoryCategorySchema = createInsertSchema(inventoryCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStoreInventorySchema = createInsertSchema(storeInventory).omit({
  id: true,
  updatedAt: true,
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({
  id: true,
  performedAt: true,
});

export const insertStockAlertSchema = createInsertSchema(stockAlerts).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type TaskList = typeof taskLists.$inferSelect;
export type InsertTaskList = typeof taskLists.$inferInsert;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskItem = typeof taskItems.$inferSelect;
export type InsertTaskItem = z.infer<typeof insertTaskItemSchema>;
export type TaskPhoto = typeof taskPhotos.$inferSelect;
export type InsertTaskPhoto = z.infer<typeof insertTaskPhotoSchema>;
export type TaskTransfer = typeof taskTransfers.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = z.infer<typeof insertCheckInSchema>;

// Inventory Types
export type InventoryCategory = typeof inventoryCategories.$inferSelect;
export type InsertInventoryCategory = z.infer<typeof insertInventoryCategorySchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type StoreInventory = typeof storeInventory.$inferSelect;
export type InsertStoreInventory = z.infer<typeof insertStoreInventorySchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type StockAlert = typeof stockAlerts.$inferSelect;
export type InsertStockAlert = z.infer<typeof insertStockAlertSchema>;

// Additional validation schemas
export const loginSchema = z.object({
  email: z.string().email().optional(),
  pin: z.string().length(4).optional(),
  storeId: z.number().optional(),
}).refine(data => {
  return (data.email && !data.pin && !data.storeId) || 
         (!data.email && data.pin && data.storeId);
}, {
  message: "Either email or (pin + storeId) must be provided"
});

export const claimTaskSchema = z.object({
  taskId: z.number(),
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
