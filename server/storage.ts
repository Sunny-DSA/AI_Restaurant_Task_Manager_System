// server/storage.ts
import { db } from "./db";
import {
  users,
  stores,
  tasks,
  taskPhotos,
  taskTemplates,
  taskLists,
  taskItems,
  taskTransfers,
  notifications,
  checkIns,
  taskStatusEnum,
} from "@shared/schema";
import { and, or, eq, isNull, gte, lte, desc, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";


/* -----------------------------------------------------------------------------
   Helpers to normalize .returning() result (array vs { rows: [] } union)
----------------------------------------------------------------------------- */
function rowsFrom<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && Array.isArray(res.rows)) return res.rows as T[];
  return [];
}
async function returningArray<T = any>(promise: Promise<any>): Promise<T[]> {
  const res = await promise;
  return rowsFrom<T>(res);
}

/* -----------------------------------------------------------------------------
   In-memory session check-ins used by routes.ts (snapshot of store fence)
----------------------------------------------------------------------------- */
type SessionCheckin = {
  storeId: number;
  storeName?: string;
  fence?: { lat: number; lng: number; radiusM: number };
  startedAt: string;
};
const activeSessionCheckins = new Map<number, SessionCheckin>();

/* -----------------------------------------------------------------------------
   Storage interface (intentionally loose typing; schema varies across branches)
----------------------------------------------------------------------------- */
export interface IStorage {
  // Users
  getUser(id: number): Promise<any | undefined>;
  getUserByEmail(email: string): Promise<any | undefined>;
  getUserByPin(pin: string, storeId: number): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  updateUser(id: number, updates: Partial<any>): Promise<any>;
  getUsersByStore(storeId: number): Promise<any[]>;
  getActiveUsers(storeId?: number): Promise<any[]>;

  // Stores
  getStore(id: number): Promise<any | undefined>;
  getStores(): Promise<any[]>;
  createStore(store: any): Promise<any>;
  updateStore(id: number, updates: Partial<any>): Promise<any>;

  // Task templates
  getTaskTemplate(id: number): Promise<any | undefined>;
  getTaskTemplates(storeId?: number): Promise<any[]>;
  createTaskTemplate(template: any): Promise<any>;
  updateTaskTemplate(id: number, updates: Partial<any>): Promise<any>;

  // Task lists
  getTaskLists(): Promise<any[]>;
  getTaskList(id: number): Promise<any | undefined>;
  createTaskList(listData: any): Promise<any>;
  updateTaskList(id: number, listData: any): Promise<any>;
  deleteTaskList(id: number): Promise<boolean>;
  duplicateTaskList(id: number, createdBy: number): Promise<any>;

  // Tasks
  getTask(id: number): Promise<any | undefined>;
  getTasks(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
    scheduledDate?: Date;
  }): Promise<any[]>;
  getTasksWithDetails(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
  }): Promise<any[]>;
  createTask(task: any): Promise<any>;
  updateTask(id: number, updates: Partial<any>): Promise<any>;
  deleteTask(id: number): Promise<boolean>;
  claimTask(taskId: number, userId: number): Promise<any>;
  transferTask(taskId: number, fromUserId: number, toUserId: number, reason?: string): Promise<any>;

  // Task items
  getTaskItems(taskId: number): Promise<any[]>;
  createTaskItem(item: any): Promise<any>;
  updateTaskItem(id: number, updates: Partial<any>): Promise<any>;

  // Task photos
  getTaskPhotos(taskId: number): Promise<any[]>;
  createTaskPhoto(photo: any): Promise<any>;

  // Check-ins (DB-backed)
  getActiveCheckIn(userId: number): Promise<any | undefined>;
  createCheckIn(checkIn: any): Promise<any>;
  updateCheckIn(id: number, updates: Partial<any>): Promise<any>;

  // Notifications
  getNotifications(userId: number, limit?: number): Promise<any[]>;
  createNotification(notification: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<any>;
  markNotificationRead(id: number): Promise<void>;

  // Analytics
  getTaskStats(storeId?: number, dateFrom?: Date, dateTo?: Date): Promise<{
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    averageCompletionTime: number;
    completionRate: number;
  }>;
  getUserStats(storeId?: number): Promise<{
    totalUsers: number;
    activeUsers: number;
    checkedInUsers: number;
  }>;

  // Runtime helpers used by routes.ts
  setActiveCheckin?(userId: number, data: SessionCheckin): void;
  clearActiveCheckin?(userId: number): void;
}

export class DatabaseStorage implements IStorage {
  /* ---------- Runtime helpers ---------- */
  setActiveCheckin(userId: number, data: SessionCheckin) {
    activeSessionCheckins.set(userId, data);
  }
  clearActiveCheckin(userId: number) {
    activeSessionCheckins.delete(userId);
  }

  /* ---------- Users ---------- */
  async getUser(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0] || undefined;
  }

  async getUserByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0] || undefined;
  }

  async getUserByPin(pin: string, storeId: number) {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.pin, pin), eq(users.storeId, storeId)));
    return rows[0] || undefined;
  }

  async createUser(insertUser: any) {
    const arr = await returningArray(
      db.insert(users as any).values(insertUser as any).returning()
    );
    return arr[0];
  }

  async updateUser(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db.update(users as any).set(updates as any).where(eq(users.id, id)).returning()
    );
    return arr[0];
  }

  async getUsersByStore(storeId: number) {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.storeId, storeId), eq(users.isActive as any, true) as any))
      .orderBy(users.firstName, users.lastName);
  }

  async getActiveUsers(storeId?: number) {
    const conditions: any[] = [eq(users.isActive as any, true) as any];
    if (storeId) conditions.push(eq(users.storeId, storeId));
    return await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(users.firstName, users.lastName);
  }

  /* ---------- Stores ---------- */
  async getStore(id: number) {
    const rows = await db.select().from(stores).where(eq(stores.id, id));
    return rows[0] || undefined;
  }

  async getStores() {
    const condition = eq(stores.isActive as any, true) as any;
    return await db
      .select()
      .from(stores)
      .where(condition)
      .orderBy(stores.name);
  }

  async createStore(insertStore: any) {
    const arr = await returningArray(
      db.insert(stores as any).values(insertStore as any).returning()
    );
    return arr[0];
  }

  async updateStore(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db.update(stores as any).set(updates as any).where(eq(stores.id, id)).returning()
    );
    return arr[0];
  }

  /* ---------- Task Templates ---------- */
  async getTaskTemplate(id: number) {
    const rows = await db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id));
    return rows[0] || undefined;
  }

  async getTaskTemplates(storeId?: number) {
    if (storeId) {
      const whereClause = or(
        eq(taskTemplates.storeId, storeId),
        isNull(taskTemplates.storeId)
      );
      return await db
        .select()
        .from(taskTemplates)
        .where(whereClause)
        .orderBy(taskTemplates.title);
    }
    return await db.select().from(taskTemplates).orderBy(taskTemplates.title);
  }

  async createTaskTemplate(insertTemplate: any) {
    const arr = await returningArray(
      db.insert(taskTemplates as any).values(insertTemplate as any).returning()
    );
    return arr[0];
  }

  async updateTaskTemplate(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db
        .update(taskTemplates as any)
        .set(updates as any)
        .where(eq(taskTemplates.id, id))
        .returning()
    );
    return arr[0];
  }

  /* ---------- Task Lists ---------- */
  async getTaskLists() {
    return await db
      .select()
      .from(taskLists)
      .orderBy(taskLists.name);
  }

  async getTaskList(id: number) {
    const rows = await db.select().from(taskLists).where(eq(taskLists.id, id));
    return rows[0] || undefined;
  }

  async createTaskList(listData: any) {
    const arr = await returningArray(
      db.insert(taskLists as any).values(listData as any).returning()
    );
    return arr[0];
  }

  async updateTaskList(id: number, listData: any) {
    const arr = await returningArray(
      db
        .update(taskLists as any)
        .set(listData as any)
        .where(eq(taskLists.id, id))
        .returning()
    );
    return arr[0];
  }

  async deleteTaskList(id: number) {
    // Soft delete (recommended)
    const arr = await returningArray(
      db
        .update(taskLists as any)
        .set({ isActive: false } as any)
        .where(eq(taskLists.id, id))
        .returning()
    );
    return arr.length > 0;
  }

  async duplicateTaskList(id: number, createdBy: number) {
    const original = await this.getTaskList(id);
    if (!original) throw new Error("Task list not found");
    const arr = await returningArray(
      db
        .insert(taskLists as any)
        .values({
          name: `${(original as any).name ?? "List"} (Copy)`,
          description: (original as any).description ?? null,
          assigneeType: (original as any).assigneeType ?? "store_wide",
          assigneeId: (original as any).assigneeId ?? null,
          recurrenceType: (original as any).recurrenceType ?? null,
          recurrencePattern: (original as any).recurrencePattern ?? null,
          createdBy,
        } as any)
        .returning()
    );
    return arr[0];
  }

  /* ---------- Tasks ---------- */
  async getTask(id: number) {
    const rows = await db.select().from(tasks).where(eq(tasks.id, id));
    return rows[0] || undefined;
  }

  async getTasks(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
    scheduledDate?: Date;
  }) {
    const conditions: any[] = [];
    if (filters.storeId) conditions.push(eq(tasks.storeId, filters.storeId));
    if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    if (filters.claimedBy) conditions.push(eq(tasks.claimedBy, filters.claimedBy));
    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.scheduledDate) {
      const startOfDay = new Date(filters.scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(
        and(gte(tasks.scheduledFor, startOfDay), lte(tasks.scheduledFor, endOfDay))
      );
    }

    return await db
      .select()
      .from(tasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc((tasks as any).priority ?? tasks.id), asc((tasks as any).dueAt ?? tasks.id));
  }

  async getTasksWithDetails(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
  }) {
    const conditions: any[] = [];
    if (filters.storeId) conditions.push(eq(tasks.storeId, filters.storeId));
    if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    if (filters.claimedBy) conditions.push(eq(tasks.claimedBy, filters.claimedBy));
    if (filters.status) conditions.push(eq(tasks.status, filters.status));

    // Use distinct aliases to safely join users multiple times
    const assigneeUser = alias(users, "assignee_user");
    const claimerUser = alias(users, "claimer_user");
    const completerUser = alias(users, "completer_user");

    return await db
      .select({
        task: tasks,
        store: stores,
        assignee: assigneeUser,
        claimedByUser: claimerUser,
        completedByUser: completerUser,
      })
      .from(tasks)
      .leftJoin(stores, eq(tasks.storeId, stores.id))
      .leftJoin(assigneeUser, eq(tasks.assigneeId, assigneeUser.id))
      .leftJoin(claimerUser, eq(tasks.claimedBy, claimerUser.id))
      .leftJoin(completerUser, eq(tasks.completedBy, completerUser.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc((tasks as any).priority ?? tasks.id), asc((tasks as any).dueAt ?? tasks.id));
  }

  async createTask(insertTask: any) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(insertTask)) {
      if (v !== undefined) clean[k] = v;
    }
    if (clean.scheduledFor) clean.scheduledFor = new Date(clean.scheduledFor);
    if (clean.dueAt) clean.dueAt = new Date(clean.dueAt);

    const arr = await returningArray(
      db.insert(tasks as any).values(clean as any).returning()
    );
    return arr[0];
  }

  async updateTask(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db.update(tasks as any).set(updates as any).where(eq(tasks.id, id)).returning()
    );
    return arr[0];
  }

  async deleteTask(id: number) {
    const arr = await returningArray(
      db.delete(tasks).where(eq(tasks.id, id)).returning()
    );
    return arr.length > 0;
  }

  async claimTask(taskId: number, userId: number) {
    const arr = await returningArray(
      db
        .update(tasks as any)
        .set({
          claimedBy: userId,
          status: taskStatusEnum.CLAIMED,
          claimedAt: new Date(),
        } as any)
        .where(
          and(
            eq(tasks.id, taskId),
            or(
              eq(tasks.status, taskStatusEnum.AVAILABLE),
              eq(tasks.status, taskStatusEnum.PENDING)
            ),
            isNull(tasks.claimedBy)
          )
        )
        .returning()
    );
    const task = arr[0];
    if (!task) {
      throw new Error("Task cannot be claimed - already claimed or not available");
    }
    return task;
  }

  async transferTask(taskId: number, fromUserId: number, toUserId: number, reason?: string) {
    // Move claim/assignee to target user
    await db
      .update(tasks as any)
      .set({
        claimedBy: toUserId,
        assigneeId: toUserId,
        assigneeType: "specific_employee",
      } as any)
      .where(and(eq(tasks.id, taskId), eq(tasks.claimedBy, fromUserId)));

    // Record transfer
    const arr = await returningArray(
      db
        .insert(taskTransfers as any)
        .values({ taskId, fromUserId, toUserId, reason } as any)
        .returning()
    );
    return arr[0];
  }

  /* ---------- Task Items ---------- */
  async getTaskItems(taskId: number) {
    return await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, taskId))
      .orderBy((taskItems as any).sortOrder ?? taskItems.id);
  }

  async createTaskItem(insertItem: any) {
    const arr = await returningArray(
      db.insert(taskItems as any).values(insertItem as any).returning()
    );
    return arr[0];
  }

  async updateTaskItem(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db.update(taskItems as any).set(updates as any).where(eq(taskItems.id, id)).returning()
    );
    return arr[0];
  }

  /* ---------- Task Photos ---------- */
  async getTaskPhotos(taskId: number) {
    return await db
      .select()
      .from(taskPhotos)
      .where(eq(taskPhotos.taskId, taskId))
      .orderBy(desc((taskPhotos as any).uploadedAt ?? taskPhotos.id));
  }

  async createTaskPhoto(insertPhoto: any) {
    // Drizzle decimal columns prefer string values
    const values = {
      ...insertPhoto,
      latitude:
        insertPhoto.latitude != null ? String(insertPhoto.latitude) : null,
      longitude:
        insertPhoto.longitude != null ? String(insertPhoto.longitude) : null,
    };
    const arr = await returningArray(
      db.insert(taskPhotos as any).values(values as any).returning()
    );
    return arr[0];
  }

  /* ---------- Check-ins ---------- */
  async getActiveCheckIn(userId: number) {
    // Prefer live session snapshot if present
    const session = activeSessionCheckins.get(userId);
    if (session) {
      return {
        id: 0,
        userId,
        storeId: session.storeId,
        checkedInAt: new Date(session.startedAt),
        checkedOutAt: null,
      } as any;
    }

    const rows = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.userId, userId), isNull(checkIns.checkedOutAt)))
      .orderBy(desc((checkIns as any).checkedInAt ?? checkIns.id))
      .limit(1);

    return rows[0] || undefined;
  }

  async createCheckIn(insertCheckIn: any) {
    const arr = await returningArray(
      db.insert(checkIns as any).values(insertCheckIn as any).returning()
    );
    return arr[0];
  }

  async updateCheckIn(id: number, updates: Partial<any>) {
    const arr = await returningArray(
      db.update(checkIns as any).set(updates as any).where(eq(checkIns.id, id)).returning()
    );
    return arr[0];
  }

  /* ---------- Notifications ---------- */
  async getNotifications(userId: number, limit: number = 50) {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc((notifications as any).createdAt ?? notifications.id))
      .limit(limit);
  }

  async createNotification(notification: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: any;
  }) {
    const arr = await returningArray(
      db.insert(notifications as any).values(notification as any).returning()
    );
    return arr[0];
  }

  async markNotificationRead(id: number) {
    await db
      .update(notifications as any)
      .set({ isRead: true } as any)
      .where(eq(notifications.id, id));
  }

  /* ---------- Analytics ---------- */
  async getTaskStats(storeId?: number, dateFrom?: Date, dateTo?: Date) {
    const conditions: any[] = [];
    if (storeId) conditions.push(eq(tasks.storeId, storeId));
    if (dateFrom) conditions.push(gte((tasks as any).createdAt ?? tasks.id, dateFrom));
    if (dateTo) conditions.push(lte((tasks as any).createdAt ?? tasks.id, dateTo));

    const [raw] = await db
      .select({
        totalTasks: sql<number>`COUNT(*)`,
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.status} = ${taskStatusEnum.COMPLETED} THEN 1 ELSE 0 END)`,
        overdueTasks: sql<number>`SUM(CASE WHEN ${tasks.status} = ${taskStatusEnum.OVERDUE} THEN 1 ELSE 0 END)`,
        averageCompletionTime: sql<number | null>`AVG(${(tasks as any).actualDuration ?? 0})`,
      })
      .from(tasks)
      .where(conditions.length ? and(...conditions) : undefined);

    const completionRate =
      raw && raw.totalTasks > 0 ? (raw.completedTasks / raw.totalTasks) * 100 : 0;

    return {
      totalTasks: raw?.totalTasks ?? 0,
      completedTasks: raw?.completedTasks ?? 0,
      overdueTasks: raw?.overdueTasks ?? 0,
      averageCompletionTime: raw?.averageCompletionTime
        ? Number(raw.averageCompletionTime)
        : 0,
      completionRate: Math.round(completionRate * 100) / 100,
    };
  }

  async getUserStats(storeId?: number) {
    const conditions: any[] = [eq((users as any).isActive ?? users.id, true) as any];
    if (storeId) conditions.push(eq(users.storeId, storeId));

    const [u] = await db
      .select({ totalUsers: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(...conditions));

    const checkInConditions: any[] = [isNull((checkIns as any).checkedOutAt ?? checkIns.id)];
    if (storeId) checkInConditions.push(eq(checkIns.storeId, storeId));

    const [c] = await db
      .select({ checkedInUsers: sql<number>`COUNT(*)` })
      .from(checkIns)
      .where(and(...checkInConditions));

    return {
      totalUsers: u?.totalUsers ?? 0,
      activeUsers: u?.totalUsers ?? 0, // if you track isActive separately, adjust here
      checkedInUsers: c?.checkedInUsers ?? 0,
    };
  }
}

export const storage = new DatabaseStorage();
