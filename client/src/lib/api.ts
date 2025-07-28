import { apiRequest } from "./queryClient";

export interface Task {
  id: number;
  templateId?: number;
  storeId: number;
  title: string;
  description?: string;
  assigneeType: string;
  assigneeId?: number;
  claimedBy?: number;
  completedBy?: number;
  status: string;
  priority: string;
  scheduledFor?: string;
  dueAt?: string;
  claimedAt?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  photoRequired: boolean;
  photoCount: number;
  photosUploaded: number;
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
  latitude?: string;
  longitude?: string;
  geofenceRadius: number;
  qrCode?: string;
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

// Task API functions
export const taskApi = {
  async getTasks(filters?: {
    storeId?: number;
    status?: string;
    assigneeId?: number;
  }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.storeId) params.append("storeId", filters.storeId.toString());
    if (filters?.status) params.append("status", filters.status);
    if (filters?.assigneeId) params.append("assigneeId", filters.assigneeId.toString());
    
    const response = await apiRequest("GET", `/api/tasks?${params.toString()}`);
    return response.json();
  },

  async getMyTasks(): Promise<Task[]> {
    const response = await apiRequest("GET", "/api/tasks/my");
    return response.json();
  },

  async getAvailableTasks(): Promise<Task[]> {
    const response = await apiRequest("GET", "/api/tasks/available");
    return response.json();
  },

  async claimTask(taskId: number, location?: { latitude: number; longitude: number }): Promise<Task> {
    const response = await apiRequest("POST", `/api/tasks/${taskId}/claim`, location);
    return response.json();
  },

  async transferTask(taskId: number, toUserId: number, reason?: string): Promise<any> {
    const response = await apiRequest("POST", `/api/tasks/${taskId}/transfer`, {
      toUserId,
      reason,
    });
    return response.json();
  },

  async completeTask(taskId: number, notes?: string): Promise<Task> {
    const response = await apiRequest("POST", `/api/tasks/${taskId}/complete`, { notes });
    return response.json();
  },

  async createTask(taskData: any): Promise<Task> {
    const response = await apiRequest("POST", "/api/tasks", taskData);
    return response.json();
  },

  async uploadPhoto(taskId: number, file: File, location?: { latitude: number; longitude: number }, taskItemId?: number): Promise<any> {
    const formData = new FormData();
    formData.append("photo", file);
    if (location) {
      formData.append("latitude", location.latitude.toString());
      formData.append("longitude", location.longitude.toString());
    }
    if (taskItemId) {
      formData.append("taskItemId", taskItemId.toString());
    }

    const response = await fetch(`/api/tasks/${taskId}/photos`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }

    return response.json();
  },
};

// Store API functions
export const storeApi = {
  async getStores(): Promise<Store[]> {
    const response = await apiRequest("GET", "/api/stores");
    return response.json();
  },

  async getStore(id: number): Promise<Store> {
    const response = await apiRequest("GET", `/api/stores/${id}`);
    return response.json();
  },

  async createStore(storeData: Partial<Store>): Promise<Store> {
    const response = await apiRequest("POST", "/api/stores", storeData);
    return response.json();
  },

  async updateStore(id: number, updates: Partial<Store>): Promise<Store> {
    const response = await apiRequest("PUT", `/api/stores/${id}`, updates);
    return response.json();
  },

  async generateQR(storeId: number): Promise<{ qrCode: string }> {
    const response = await apiRequest("POST", `/api/stores/${storeId}/generate-qr`);
    return response.json();
  },

  async getStoreStats(storeId: number): Promise<TaskStats & UserStats> {
    const response = await apiRequest("GET", `/api/stores/${storeId}/stats`);
    return response.json();
  },
};

// User API functions
export const userApi = {
  async getUsers(storeId?: number): Promise<User[]> {
    const params = storeId ? `?storeId=${storeId}` : "";
    const response = await apiRequest("GET", `/api/users${params}`);
    return response.json();
  },

  async createUser(userData: Partial<User> & { password?: string }): Promise<User> {
    const response = await apiRequest("POST", "/api/users", userData);
    return response.json();
  },

  async resetPin(userId: number): Promise<{ pin: string }> {
    const response = await apiRequest("PUT", `/api/users/${userId}/reset-pin`);
    return response.json();
  },
};

// Analytics API functions
export const analyticsApi = {
  async getTaskStats(storeId?: number, dateFrom?: Date, dateTo?: Date): Promise<TaskStats> {
    const params = new URLSearchParams();
    if (storeId) params.append("storeId", storeId.toString());
    if (dateFrom) params.append("dateFrom", dateFrom.toISOString());
    if (dateTo) params.append("dateTo", dateTo.toISOString());
    
    const response = await apiRequest("GET", `/api/analytics/tasks?${params.toString()}`);
    return response.json();
  },

  async getUserStats(storeId?: number): Promise<UserStats> {
    const params = storeId ? `?storeId=${storeId}` : "";
    const response = await apiRequest("GET", `/api/analytics/users${params}`);
    return response.json();
  },
};
