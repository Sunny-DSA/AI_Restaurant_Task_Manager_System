import { storage } from "../storage";
import { InsertTask, InsertTaskItem, taskStatusEnum, roleEnum } from "@shared/schema";
import { AuthService } from "./authService";

export class TaskService {
  static async createTask(taskData: any) {
    // Convert date strings to Date objects
    const processedData = {
      ...taskData,
      scheduledFor: typeof taskData.scheduledFor === 'string' ? new Date(taskData.scheduledFor) : taskData.scheduledFor,
      dueAt: taskData.dueAt ? (typeof taskData.dueAt === 'string' ? new Date(taskData.dueAt) : taskData.dueAt) : undefined,
      status: taskStatusEnum.PENDING,
    };
    
    const task = await storage.createTask(processedData);
    
    return task;
  }

  static async createTaskFromTemplate(
    templateId: number,
    storeId: number,
    scheduledFor: Date,
    assigneeType: string,
    assigneeId?: number
  ) {
    const template = await storage.getTaskTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Calculate due date (add estimated duration)
    const dueAt = new Date(scheduledFor);
    if (template.estimatedDuration) {
      dueAt.setMinutes(dueAt.getMinutes() + template.estimatedDuration);
    }
    
    const task = await storage.createTask({
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
    
    return task;
  }
  
  static async claimTask(taskId: number, userId: number, latitude?: number, longitude?: number) {
    // Verify user can claim tasks
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    if (!AuthService.hasPermission(user.role, "complete", "tasks")) {
      throw new Error("User cannot claim tasks");
    }
    
    // Check if user is checked in
    const activeCheckIn = await storage.getActiveCheckIn(userId);
    if (!activeCheckIn) {
      throw new Error("User must be checked in to claim tasks");
    }
    
    const task = await storage.claimTask(taskId, userId);
    
    // Create notification for managers
    if (task.storeId) {
      const managers = await storage.getUsersByStore(task.storeId);
      const managerUsers = managers.filter(u => 
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
    // Verify both users exist and can handle tasks
    const fromUser = await storage.getUser(fromUserId);
    const toUser = await storage.getUser(toUserId);
    
    if (!fromUser || !toUser) {
      throw new Error("User not found");
    }
    
    if (!AuthService.hasPermission(toUser.role, "complete", "tasks")) {
      throw new Error("Target user cannot handle tasks");
    }
    
    // Verify both users are in same store
    if (fromUser.storeId !== toUser.storeId) {
      throw new Error("Users must be in same store for transfer");
    }
    
    // Verify target user is checked in
    const toUserCheckIn = await storage.getActiveCheckIn(toUserId);
    if (!toUserCheckIn) {
      throw new Error("Target user must be checked in");
    }
    
    const transfer = await storage.transferTask(taskId, fromUserId, toUserId, reason);
    
    // Create notifications
    await storage.createNotification({
      userId: toUserId,
      type: "task_transferred",
      title: "Task Transferred to You",
      message: `${fromUser.firstName} ${fromUser.lastName} transferred a task to you${reason ? `: ${reason}` : ""}`,
      data: { taskId, fromUserId, reason },
    });
    
    return transfer;
  }
  
  static async completeTask(taskId: number, userId: number, notes?: string) {
    const task = await storage.getTask(taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    if (task.claimedBy !== userId) {
      throw new Error("Task not claimed by this user");
    }
    
    // Check if all required photos are uploaded
    if (task.photoRequired && task.photoCount) {
      const photos = await storage.getTaskPhotos(taskId);
      if (photos.length < task.photoCount) {
        throw new Error(`${task.photoCount} photos required, only ${photos.length} uploaded`);
      }
    }
    
    // Calculate actual duration
    let actualDuration: number | undefined;
    if (task.startedAt) {
      actualDuration = Math.round((Date.now() - task.startedAt.getTime()) / (1000 * 60));
    }
    
    const completedTask = await storage.updateTask(taskId, {
      status: taskStatusEnum.COMPLETED,
      completedBy: userId,
      completedAt: new Date(),
      actualDuration,
      notes,
    });
    
    // Create completion notification for managers
    if (task.storeId) {
      const user = await storage.getUser(userId);
      const managers = await storage.getUsersByStore(task.storeId);
      const managerUsers = managers.filter(u => 
        u.role === roleEnum.STORE_MANAGER || 
        u.role === roleEnum.ADMIN || 
        u.role === roleEnum.MASTER_ADMIN
      );
      
      for (const manager of managerUsers) {
        await storage.createNotification({
          userId: manager.id,
          type: "task_completed",
          title: "Task Completed",
          message: `${user?.firstName} ${user?.lastName} completed task: ${task.title}`,
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
    if (!user) {
      throw new Error("User not found");
    }
    
    const userStoreId = storeId || user.storeId;
    if (!userStoreId) {
      return [];
    }
    
    // Get tasks based on user role
    switch (user.role) {
      case roleEnum.EMPLOYEE:
        // Only tasks assigned to them or available store-wide tasks they can claim
        return await storage.getTasks({
          storeId: userStoreId,
          assigneeId: userId,
        });
        
      case roleEnum.STORE_MANAGER:
      case roleEnum.ADMIN:
      case roleEnum.MASTER_ADMIN:
        // All tasks in their store(s)
        return await storage.getTasks({
          storeId: userStoreId,
        });
        
      default:
        return [];
    }
  }
  
  static async getAvailableTasks(storeId: number) {
    return await storage.getTasks({
      storeId,
      status: taskStatusEnum.AVAILABLE,
    });
  }
  
  static async updateTaskProgress(taskId: number, userId: number) {
    const task = await storage.getTask(taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    if (task.claimedBy !== userId) {
      throw new Error("Task not claimed by this user");
    }
    
    // If task was just claimed, mark as in progress
    if (task.status === taskStatusEnum.CLAIMED && !task.startedAt) {
      return await storage.updateTask(taskId, {
        status: taskStatusEnum.IN_PROGRESS,
        startedAt: new Date(),
      });
    }
    
    return task;
  }
}
