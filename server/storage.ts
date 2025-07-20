import {
  users,
  stores,
  tasks,
  taskTemplates,
  taskItems,
  taskPhotos,
  taskTransfers,
  notifications,
  checkIns,
  type User,
  type InsertUser,
  type Store,
  type InsertStore,
  type Task,
  type InsertTask,
  type TaskTemplate,
  type InsertTaskTemplate,
  type TaskItem,
  type InsertTaskItem,
  type TaskPhoto,
  type InsertTaskPhoto,
  type TaskTransfer,
  type Notification,
  type CheckIn,
  type InsertCheckIn,
  roleEnum,
  taskStatusEnum,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, asc, gte, lte, isNull, count, avg, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPin(pin: string, storeId: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  getUsersByStore(storeId: number): Promise<User[]>;
  getActiveUsers(storeId?: number): Promise<User[]>;
  
  // Store operations
  getStore(id: number): Promise<Store | undefined>;
  getStores(): Promise<Store[]>;
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: number, updates: Partial<Store>): Promise<Store>;
  
  // Task template operations
  getTaskTemplate(id: number): Promise<TaskTemplate | undefined>;
  getTaskTemplates(storeId?: number): Promise<TaskTemplate[]>;
  createTaskTemplate(template: InsertTaskTemplate): Promise<TaskTemplate>;
  updateTaskTemplate(id: number, updates: Partial<TaskTemplate>): Promise<TaskTemplate>;
  
  // Task operations
  getTask(id: number): Promise<Task | undefined>;
  getTasks(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
    scheduledDate?: Date;
  }): Promise<Task[]>;
  getTasksWithDetails(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
  }): Promise<any[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<Task>): Promise<Task>;
  claimTask(taskId: number, userId: number): Promise<Task>;
  transferTask(taskId: number, fromUserId: number, toUserId: number, reason?: string): Promise<TaskTransfer>;
  
  // Task item operations
  getTaskItems(taskId: number): Promise<TaskItem[]>;
  createTaskItem(item: InsertTaskItem): Promise<TaskItem>;
  updateTaskItem(id: number, updates: Partial<TaskItem>): Promise<TaskItem>;
  
  // Task photo operations
  getTaskPhotos(taskId: number): Promise<TaskPhoto[]>;
  createTaskPhoto(photo: InsertTaskPhoto): Promise<TaskPhoto>;
  
  // Check-in operations
  getActiveCheckIn(userId: number): Promise<CheckIn | undefined>;
  createCheckIn(checkIn: InsertCheckIn): Promise<CheckIn>;
  updateCheckIn(id: number, updates: Partial<CheckIn>): Promise<CheckIn>;
  
  // Notification operations
  getNotifications(userId: number, limit?: number): Promise<Notification[]>;
  createNotification(notification: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  
  // Analytics operations
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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByPin(pin: string, storeId: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.pin, pin), eq(users.storeId, storeId)));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        updatedAt: new Date(),
      })
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUsersByStore(storeId: number): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.storeId, storeId), eq(users.isActive, true)))
      .orderBy(users.firstName, users.lastName);
  }

  async getActiveUsers(storeId?: number): Promise<User[]> {
    const conditions = [eq(users.isActive, true)];
    if (storeId) {
      conditions.push(eq(users.storeId, storeId));
    }
    
    return await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(users.firstName, users.lastName);
  }

  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store || undefined;
  }

  async getStores(): Promise<Store[]> {
    return await db
      .select()
      .from(stores)
      .where(eq(stores.isActive, true))
      .orderBy(stores.name);
  }

  async createStore(insertStore: InsertStore): Promise<Store> {
    const [store] = await db
      .insert(stores)
      .values({
        ...insertStore,
        updatedAt: new Date(),
      })
      .returning();
    return store;
  }

  async updateStore(id: number, updates: Partial<Store>): Promise<Store> {
    const [store] = await db
      .update(stores)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return store;
  }

  async getTaskTemplate(id: number): Promise<TaskTemplate | undefined> {
    const [template] = await db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id));
    return template || undefined;
  }

  async getTaskTemplates(storeId?: number): Promise<TaskTemplate[]> {
    const conditions = [eq(taskTemplates.isActive, true)];
    if (storeId) {
      conditions.push(or(eq(taskTemplates.storeId, storeId), isNull(taskTemplates.storeId)));
    }
    
    return await db
      .select()
      .from(taskTemplates)
      .where(and(...conditions))
      .orderBy(taskTemplates.title);
  }

  async createTaskTemplate(insertTemplate: InsertTaskTemplate): Promise<TaskTemplate> {
    const [template] = await db
      .insert(taskTemplates)
      .values({
        ...insertTemplate,
        updatedAt: new Date(),
      })
      .returning();
    return template;
  }

  async updateTaskTemplate(id: number, updates: Partial<TaskTemplate>): Promise<TaskTemplate> {
    const [template] = await db
      .update(taskTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(taskTemplates.id, id))
      .returning();
    return template;
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTasks(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
    scheduledDate?: Date;
  }): Promise<Task[]> {
    const conditions = [];
    
    if (filters.storeId) {
      conditions.push(eq(tasks.storeId, filters.storeId));
    }
    if (filters.assigneeId) {
      conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    }
    if (filters.claimedBy) {
      conditions.push(eq(tasks.claimedBy, filters.claimedBy));
    }
    if (filters.status) {
      conditions.push(eq(tasks.status, filters.status));
    }
    if (filters.scheduledDate) {
      const startOfDay = new Date(filters.scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(
        and(
          gte(tasks.scheduledFor, startOfDay),
          lte(tasks.scheduledFor, endOfDay)
        )
      );
    }
    
    return await db
      .select()
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.priority), asc(tasks.dueAt));
  }

  async getTasksWithDetails(filters: {
    storeId?: number;
    assigneeId?: number;
    claimedBy?: number;
    status?: string;
  }): Promise<any[]> {
    const conditions = [];
    
    if (filters.storeId) {
      conditions.push(eq(tasks.storeId, filters.storeId));
    }
    if (filters.assigneeId) {
      conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    }
    if (filters.claimedBy) {
      conditions.push(eq(tasks.claimedBy, filters.claimedBy));
    }
    if (filters.status) {
      conditions.push(eq(tasks.status, filters.status));
    }
    
    return await db
      .select({
        task: tasks,
        store: stores,
        assignee: users,
        claimedByUser: users,
        completedByUser: users,
      })
      .from(tasks)
      .leftJoin(stores, eq(tasks.storeId, stores.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .leftJoin(users, eq(tasks.claimedBy, users.id))
      .leftJoin(users, eq(tasks.completedBy, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.priority), asc(tasks.dueAt));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values({
        ...insertTask,
        updatedAt: new Date(),
      })
      .returning();
    return task;
  }

  async updateTask(id: number, updates: Partial<Task>): Promise<Task> {
    const [task] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async claimTask(taskId: number, userId: number): Promise<Task> {
    const [task] = await db
      .update(tasks)
      .set({
        claimedBy: userId,
        status: taskStatusEnum.CLAIMED,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
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
      .returning();
    
    if (!task) {
      throw new Error("Task cannot be claimed - already claimed or not available");
    }
    
    return task;
  }

  async transferTask(
    taskId: number,
    fromUserId: number,
    toUserId: number,
    reason?: string
  ): Promise<TaskTransfer> {
    // Update task to new user
    await db
      .update(tasks)
      .set({
        claimedBy: toUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.claimedBy, fromUserId)
        )
      );
    
    // Create transfer record
    const [transfer] = await db
      .insert(taskTransfers)
      .values({
        taskId,
        fromUserId,
        toUserId,
        reason,
      })
      .returning();
    
    return transfer;
  }

  async getTaskItems(taskId: number): Promise<TaskItem[]> {
    return await db
      .select()
      .from(taskItems)
      .where(eq(taskItems.taskId, taskId))
      .orderBy(taskItems.sortOrder);
  }

  async createTaskItem(insertItem: InsertTaskItem): Promise<TaskItem> {
    const [item] = await db
      .insert(taskItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async updateTaskItem(id: number, updates: Partial<TaskItem>): Promise<TaskItem> {
    const [item] = await db
      .update(taskItems)
      .set(updates)
      .where(eq(taskItems.id, id))
      .returning();
    return item;
  }

  async getTaskPhotos(taskId: number): Promise<TaskPhoto[]> {
    return await db
      .select()
      .from(taskPhotos)
      .where(eq(taskPhotos.taskId, taskId))
      .orderBy(desc(taskPhotos.uploadedAt));
  }

  async createTaskPhoto(insertPhoto: InsertTaskPhoto): Promise<TaskPhoto> {
    const [photo] = await db
      .insert(taskPhotos)
      .values(insertPhoto)
      .returning();
    return photo;
  }

  async getActiveCheckIn(userId: number): Promise<CheckIn | undefined> {
    const [checkIn] = await db
      .select()
      .from(checkIns)
      .where(
        and(
          eq(checkIns.userId, userId),
          isNull(checkIns.checkedOutAt)
        )
      )
      .orderBy(desc(checkIns.checkedInAt))
      .limit(1);
    
    return checkIn || undefined;
  }

  async createCheckIn(insertCheckIn: InsertCheckIn): Promise<CheckIn> {
    const [checkIn] = await db
      .insert(checkIns)
      .values(insertCheckIn)
      .returning();
    return checkIn;
  }

  async updateCheckIn(id: number, updates: Partial<CheckIn>): Promise<CheckIn> {
    const [checkIn] = await db
      .update(checkIns)
      .set(updates)
      .where(eq(checkIns.id, id))
      .returning();
    return checkIn;
  }

  async getNotifications(userId: number, limit: number = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async createNotification(notification: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<Notification> {
    const [notif] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return notif;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async getTaskStats(
    storeId?: number,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    averageCompletionTime: number;
    completionRate: number;
  }> {
    const conditions = [];
    
    if (storeId) {
      conditions.push(eq(tasks.storeId, storeId));
    }
    if (dateFrom) {
      conditions.push(gte(tasks.createdAt, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(tasks.createdAt, dateTo));
    }
    
    const [stats] = await db
      .select({
        totalTasks: count(),
        completedTasks: count(sql`CASE WHEN ${tasks.status} = ${taskStatusEnum.COMPLETED} THEN 1 END`),
        overdueTasks: count(sql`CASE WHEN ${tasks.status} = ${taskStatusEnum.OVERDUE} THEN 1 END`),
        averageCompletionTime: avg(tasks.actualDuration),
      })
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const completionRate = stats.totalTasks > 0 
      ? (stats.completedTasks / stats.totalTasks) * 100 
      : 0;
    
    return {
      totalTasks: stats.totalTasks || 0,
      completedTasks: stats.completedTasks || 0,
      overdueTasks: stats.overdueTasks || 0,
      averageCompletionTime: Number(stats.averageCompletionTime) || 0,
      completionRate: Math.round(completionRate * 100) / 100,
    };
  }

  async getUserStats(storeId?: number): Promise<{
    totalUsers: number;
    activeUsers: number;
    checkedInUsers: number;
  }> {
    const conditions = [eq(users.isActive, true)];
    if (storeId) {
      conditions.push(eq(users.storeId, storeId));
    }
    
    const [stats] = await db
      .select({
        totalUsers: count(),
      })
      .from(users)
      .where(and(...conditions));
    
    // Get checked in users
    const checkInConditions = [isNull(checkIns.checkedOutAt)];
    if (storeId) {
      checkInConditions.push(eq(checkIns.storeId, storeId));
    }
    
    const [checkInStats] = await db
      .select({
        checkedInUsers: count(),
      })
      .from(checkIns)
      .where(and(...checkInConditions));
    
    return {
      totalUsers: stats.totalUsers || 0,
      activeUsers: stats.totalUsers || 0, // For now, same as total
      checkedInUsers: checkInStats.checkedInUsers || 0,
    };
  }
}

export const storage = new DatabaseStorage();
