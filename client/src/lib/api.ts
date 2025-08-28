// client/src/lib/api.ts
import { apiRequest } from "./queryClient";

/* =========
   Types
   ========= */

export interface Task {
  id: number;
  templateId?: number;
  storeId: number;
  title: string;
  description?: string;

  // assignment/ownership
  assigneeType: string;
  assigneeId?: number;
  claimedBy?: number;
  completedBy?: number;

  // status & timing
  status: string; // "pending" | "available" | "claimed" | "in_progress" | "completed" | "overdue"
  priority: string; // "low" | "medium" | "high" (backend accepts string)
  scheduledFor?: string; // ISO date-time
  dueAt?: string;        // ISO date-time
  claimedAt?: string;
  startedAt?: string;
  completedAt?: string;

  // durations & photos
  estimatedDuration?: number;
  actualDuration?: number;
  photoRequired: boolean;
  photoCount: number;
  photosUploaded: number;

  // per-task geofence (optional override of store fence)
  geoLat?: string | null;      // decimals come back as strings from PG
  geoLng?: string | null;
  geoRadiusM?: number | null;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: number;
  name: string;
  address: string;
  phone?: string;
  timezone: string;
  latitude?: string | null;
  longitude?: string | null;
  geofenceRadius: number;
  qrCode?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  storeId?: number;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface TaskStats {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  averageCompletionTime: number;
  completionRate: number;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  checkedInUsers: number;
}

/* =========
   Payloads
   ========= */

export type RecurrencePayload = {
  frequency: "daily" | "weekly" | "monthly";
  interval?: number; // default 1
  count?: number;    // default 1
};

export type CreateTaskPayload = {
  title: string;
  description?: string;
  storeId: number;
  assigneeId?: number;
  assigneeType?: string; // server will default if omitted
  priority?: "low" | "medium" | "high";
  scheduledFor?: string | Date;
  dueAt?: string | Date;

  photoRequired?: boolean;
  photoCount?: number;

  // optional per-task geofence override
  geoLat?: number;
  geoLng?: number;
  geoRadiusM?: number;

  // recurrence
  recurrence?: RecurrencePayload;
};

export type UpdateTaskPayload = Partial<{
  title: string;
  description: string;
  status: string;
  assigneeId: number;
  priority: "low" | "medium" | "high";
  scheduledFor: string | Date;
  dueAt: string | Date;
  photoRequired: boolean;
  photoCount: number;
  notes: string;
  geoLat: number;
  geoLng: number;
  geoRadiusM: number;
}>;

type Coords = { latitude: number; longitude: number };

/* =========
   Helpers
   ========= */

const toIsoIfDate = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString();
  return v;
};

/* =========
   API
   ========= */

export const taskApi = {
  async getTasks(filters?: {
    storeId?: number;
    status?: string;
    assigneeId?: number;
    scheduledDate?: Date | string; // optional convenience filter if your backend supports it
  }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.storeId) params.append("storeId", String(filters.storeId));
    if (filters?.status) params.append("status", filters.status);
    if (filters?.assigneeId) params.append("assigneeId", String(filters.assigneeId));
    if (filters?.scheduledDate) {
      const val =
        filters.scheduledDate instanceof Date
          ? filters.scheduledDate.toISOString()
          : String(filters.scheduledDate);
      params.append("scheduledDate", val);
    }

    const res = await apiRequest("GET", `/api/tasks?${params.toString()}`);
    return res.json();
  },

  async getMyTasks(): Promise<Task[]> {
    const res = await apiRequest("GET", "/api/tasks/my");
    return res.json();
  },

  async getAvailableTasks(storeId?: number): Promise<Task[]> {
    const params = storeId ? `?storeId=${storeId}` : "";
    const res = await apiRequest("GET", `/api/tasks/available${params}`);
    return res.json();
  },

  async claimTask(taskId: number, location?: Coords): Promise<Task> {
    const res = await apiRequest("POST", `/api/tasks/${taskId}/claim`, location);
    return res.json();
  },

  async transferTask(taskId: number, toUserId: number, reason?: string): Promise<any> {
    const res = await apiRequest("POST", `/api/tasks/${taskId}/transfer`, { toUserId, reason });
    return res.json();
  },

  async completeTask(
    taskId: number,
    options?: { notes?: string; forceComplete?: boolean; overridePhotoRequirement?: boolean }
  ): Promise<Task> {
    const res = await apiRequest("POST", `/api/tasks/${taskId}/complete`, options ?? {});
    return res.json();
  },

  async createTask(taskData: CreateTaskPayload): Promise<Task | Task[]> {
    // Coerce possible Date fields to ISO for safety
    const body = {
      ...taskData,
      scheduledFor: toIsoIfDate(taskData.scheduledFor),
      dueAt: toIsoIfDate(taskData.dueAt),
    };
    const res = await apiRequest("POST", "/api/tasks", body);
    return res.json();
  },

  async updateTask(taskId: number, taskData: UpdateTaskPayload): Promise<Task> {
    const body: Record<string, unknown> = { ...taskData };
    if (body.scheduledFor) body.scheduledFor = toIsoIfDate(body.scheduledFor);
    if (body.dueAt) body.dueAt = toIsoIfDate(body.dueAt);

    const res = await apiRequest("PUT", `/api/tasks/${taskId}`, body);
    return res.json();
  },

  async deleteTask(taskId: number): Promise<void> {
    await apiRequest("DELETE", `/api/tasks/${taskId}`);
  },

  async uploadPhoto(
    taskId: number,
    file: File,
    location?: Coords,
    taskItemId?: number
  ): Promise<any> {
    const formData = new FormData();
    formData.append("photo", file);
    if (location) {
      formData.append("latitude", String(location.latitude));
      formData.append("longitude", String(location.longitude));
    }
    if (taskItemId) formData.append("taskItemId", String(taskItemId));

    const res = await fetch(`/api/tasks/${taskId}/photos`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  },
};

export const storeApi = {
  async getStores(): Promise<Store[]> {
    const res = await apiRequest("GET", "/api/stores");
    return res.json();
  },

  async getStore(id: number): Promise<Store> {
    const res = await apiRequest("GET", `/api/stores/${id}`);
    return res.json();
  },

  async createStore(storeData: Partial<Store>): Promise<Store> {
    const res = await apiRequest("POST", "/api/stores", storeData);
    return res.json();
  },

  async updateStore(id: number, updates: Partial<Store>): Promise<Store> {
    const res = await apiRequest("PUT", `/api/stores/${id}`, updates);
    return res.json();
  },

  async generateQR(storeId: number): Promise<{ qrCode: string }> {
    const res = await apiRequest("POST", `/api/stores/${storeId}/generate-qr`);
    return res.json();
  },

  async getStoreStats(storeId: number): Promise<TaskStats & UserStats> {
    const res = await apiRequest("GET", `/api/stores/${storeId}/stats`);
    return res.json();
  },
};

export const userApi = {
  async getUsers(storeId?: number): Promise<User[]> {
    const params = storeId ? `?storeId=${storeId}` : "";
    const res = await apiRequest("GET", `/api/users${params}`);
    return res.json();
  },

  async createUser(userData: Partial<User> & { password?: string }): Promise<User> {
    const res = await apiRequest("POST", "/api/users", userData);
    return res.json();
  },

  async resetPin(userId: number): Promise<{ pin: string }> {
    const res = await apiRequest("PUT", `/api/users/${userId}/reset-pin`);
    return res.json();
  },
};

export const analyticsApi = {
  async getTaskStats(storeId?: number, dateFrom?: Date, dateTo?: Date): Promise<TaskStats> {
    const params = new URLSearchParams();
    if (storeId) params.append("storeId", String(storeId));
    if (dateFrom) params.append("dateFrom", dateFrom.toISOString());
    if (dateTo) params.append("dateTo", dateTo.toISOString());

    const res = await apiRequest("GET", `/api/analytics/tasks?${params.toString()}`);
    return res.json();
  },

  async getUserStats(storeId?: number): Promise<UserStats> {
    const params = storeId ? `?storeId=${storeId}` : "";
    const res = await apiRequest("GET", `/api/analytics/users${params}`);
    return res.json();
  },
};
