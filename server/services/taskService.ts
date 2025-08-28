import { storage } from "../storage";
import { taskStatusEnum, roleEnum } from "@shared/schema";
import { AuthService } from "./authService";

// Robust date coercion for any incoming value
const toDate = (v: unknown): Date | undefined => {
  if (v == null) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
    }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
};

export class TaskService {
  static async createTask(taskData: any) {
    if (!taskData.storeId) throw new Error("storeId is required");
    if (!taskData.title) throw new Error("Task title is required");

    const scheduledFor = toDate(taskData.scheduledFor) ?? new Date();
    const dueAt = toDate(taskData.dueAt);

    // Handle recurrence (daily/weekly/monthly) with object payload
    if (taskData.recurrence) {
      const { frequency, interval = 1, count = 1 } = taskData
        .recurrence as {
        frequency: "daily" | "weekly" | "monthly";
        interval?: number;
        count?: number;
      };

      const createdTasks: any[] = [];
      let nextDate = new Date(scheduledFor);

      for (let i = 0; i < count; i++) {
        const t = await storage.createTask({
          ...taskData,
          scheduledFor: new Date(nextDate),
          dueAt,
          status: taskStatusEnum.PENDING,
        });
        createdTasks.push(t);

        // increment recurrence
        if (frequency === "daily") nextDate.setDate(nextDate.getDate() + interval);
        if (frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7 * interval);
        if (frequency === "monthly") nextDate.setMonth(nextDate.getMonth() + interval);
      }

      return createdTasks;
    }

    // Non-recurring
    return await storage.createTask({
      ...taskData,
      scheduledFor,
      dueAt,
      status: taskStatusEnum.PENDING,
    });
  }

  static async createTaskFromTemplate(
    templateId: number,
    storeId: number,
    scheduledFor: Date,
    assigneeType: string,
    assigneeId?: number
  ) {
    const template = await storage.getTaskTemplate(templateId);
    if (!template) throw new Error("Template not found");

    const dueAt = new Date(scheduledFor);
    if (template.estimatedDuration) {
      dueAt.setMinutes(dueAt.getMinutes() + template.estimatedDuration);
    }

    return await storage.createTask({
      templateId,
      storeId,
      title: template.title,
      description: template.description || undefined,
      assigneeType,
      assigneeId,
      status: taskStatusEnum.PENDING,
      scheduledFor,
      dueAt,
      estimatedDuration: template.estimatedDuration || undefined,
      photoRequired: template.photoRequired,
      photoCount: template.photoCount,
    });
  }

  static async claimTask(
    taskId: number,
    userId: number,
    latitude?: number,
    longitude?: number
  ) {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    if (!AuthService.hasPermission(user.role, "complete", "tasks")) {
      throw new Error("User cannot claim tasks");
    }

    const activeCheckIn = await storage.getActiveCheckIn(userId);
    if (!activeCheckIn) throw new Error("User must be checked in to claim tasks");

    const task = await storage.claimTask(taskId, userId);

    if (task.storeId) {
      const managers = await storage.getUsersByStore(task.storeId);
      const managerUsers = managers.filter(
        (u) =>
          u.role === roleEnum.STORE_MANAGER ||
          u.role === roleEnum.ADMIN ||
          u.role === roleEnum.MASTER_ADMIN
      );

      for (const manager of managerUsers) {
        await storage.createNotification({
          userId: manager.id,
          type: "task_claimed",
          title: "Task Claimed",
          message: `${user.firstName} ${user.lastName} claimed task: ${task.title}`,
          data: { taskId: task.id, claimedBy: userId },
        });
      }
    }

    return task;
  }

  static async transferTask(
    taskId: number,
    fromUserId: number,
    toUserId: number,
    reason?: string
  ) {
    const fromUser = await storage.getUser(fromUserId);
    const toUser = await storage.getUser(toUserId);
    if (!fromUser || !toUser) throw new Error("User not found");

    if (!AuthService.hasPermission(toUser.role, "complete", "tasks")) {
      throw new Error("Target user cannot handle tasks");
    }

    if (fromUser.storeId !== toUser.storeId) {
      throw new Error("Users must be in same store for transfer");
    }

    const toUserCheckIn = await storage.getActiveCheckIn(toUserId);
    if (!toUserCheckIn) throw new Error("Target user must be checked in");

    const transfer = await storage.transferTask(taskId, fromUserId, toUserId, reason);

    await storage.createNotification({
      userId: toUserId,
      type: "task_transferred",
      title: "Task Transferred to You",
      message: `${fromUser.firstName} ${fromUser.lastName} transferred a task to you${
        reason ? `: ${reason}` : ""
      }`,
      data: { taskId, fromUserId, reason },
    });

    return transfer;
  }

  static async completeTask(
    taskId: number,
    userId: number,
    notes?: string,
    options?: { forceComplete?: boolean; overridePhotoRequirement?: boolean }
  ) {
    const task = await storage.getTask(taskId);
    if (!task) throw new Error("Task not found");

    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const isAdmin = user.role === roleEnum.ADMIN;
    const isManager = user.role === roleEnum.STORE_MANAGER;
    const canForce = isAdmin || isManager;

    if (task.claimedBy !== userId && !(canForce && options?.forceComplete)) {
      throw new Error("Task not claimed by this user");
    }

    if (task.photoRequired && task.photoCount) {
      const photos = await storage.getTaskPhotos(taskId);
      const haveEnough = photos.length >= task.photoCount;
      const overriding = !!options?.overridePhotoRequirement && canForce;
      if (!haveEnough && !overriding) {
        throw new Error(`${task.photoCount} photos required, only ${photos.length} uploaded`);
      }
    }

    let actualDuration: number | undefined;
    if (task.startedAt) {
      actualDuration = Math.round(
        (Date.now() - task.startedAt.getTime()) / (1000 * 60)
      );
    }

    const completedTask = await storage.updateTask(taskId, {
      status: taskStatusEnum.COMPLETED,
      completedBy: userId,
      completedAt: new Date(),
      actualDuration,
      notes,
    });

    if (task.storeId) {
      const managers = await storage.getUsersByStore(task.storeId);
      const managerUsers = managers.filter(
        (u) =>
          u.role === roleEnum.STORE_MANAGER ||
          u.role === roleEnum.ADMIN ||
          u.role === roleEnum.MASTER_ADMIN
      );

      for (const manager of managerUsers) {
        await storage.createNotification({
          userId: manager.id,
          type: "task_completed",
          title: "Task Completed",
          message: `${user.firstName} ${user.lastName} completed task: ${task.title}`,
          data: { taskId: task.id, completedBy: userId, actualDuration },
        });
      }
    }

    return completedTask;
  }

  static async markTaskOverdue(taskId: number) {
    return await storage.updateTask(taskId, {
      status: taskStatusEnum.OVERDUE,
    });
  }

  static async getTasksForUser(userId: number, storeId?: number) {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const userStoreId = storeId || user.storeId;
    if (!userStoreId) return [];

    switch (user.role) {
      case roleEnum.EMPLOYEE:
        return await storage.getTasks({
          storeId: userStoreId,
          assigneeId: userId,
        });
      case roleEnum.STORE_MANAGER:
      case roleEnum.ADMIN:
      case roleEnum.MASTER_ADMIN:
        return await storage.getTasks({ storeId: userStoreId });
      default:
        return [];
    }
  }

  static async getAvailableTasks(storeId?: number) {
    if (!storeId) return [];
    return await storage.getTasks({
      storeId,
      status: taskStatusEnum.AVAILABLE,
    });
  }

  static async updateTaskProgress(taskId: number, userId: number) {
    const task = await storage.getTask(taskId);
    if (!task) throw new Error("Task not found");

    if (task.claimedBy !== userId) {
      throw new Error("Task not claimed by this user");
    }

    if (task.status === taskStatusEnum.CLAIMED && !task.startedAt) {
      return await storage.updateTask(taskId, {
        status: taskStatusEnum.IN_PROGRESS,
        startedAt: new Date(),
      });
    }

    return task;
  }
}
