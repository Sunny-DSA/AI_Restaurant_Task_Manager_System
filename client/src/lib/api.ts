// client/src/lib/api.ts

/* =========
   Small HTTP helper
   ========= */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Same-origin fetch with cookies enabled, JSON in/out with useful errors.
 * Always call with a relative URL like "/api/..." so the Vite proxy works.
 */
export async function apiRequest<T = any>(
  method: HttpMethod,
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
        ? body
        : JSON.stringify(body),
  });

  let payload: any;
  try {
    const text = await res.text();
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const serverMsg =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
        ? payload.error
        : undefined;

    const fallbackByStatus: Record<number, string> = {
      400: "Please check your input and try again.",
      401: "Login failed. Please check your credentials.",
      403: "You don’t have permission to do that.",
      404: "We couldn’t find what you were looking for.",
      422: "Some fields need attention.",
      429: "Too many requests. Please try again shortly.",
      500: "Something went wrong on our side. Please try again.",
    };

    const friendly =
      serverMsg || fallbackByStatus[res.status] || "Something went wrong. Please try again.";

    const error = new Error(friendly) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return (payload as T) ?? (undefined as T);
}

/* =========
   Types
   ========= */

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

  status: string; // "pending" | "available" | "claimed" | "in_progress" | "completed" | "overdue"
  priority: string; // "low" | "medium" | "high"
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

  geoLat?: string | null;
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
  interval?: number;
  count?: number;
};

export type CreateTaskPayload = {
  title: string;
  description?: string;
  storeId: number;
  assigneeId?: number;
  assigneeType?: string;
  priority?: "low" | "medium" | "high";
  scheduledFor?: string | Date;
  dueAt?: string | Date;

  photoRequired?: boolean;
  photoCount?: number;

  geoLat?: number;
  geoLng?: number;
  geoRadiusM?: number;

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

const toIsoIfDate = (v: unknown): unknown =>
  v instanceof Date ? v.toISOString() : v;

/* =========
   API – Tasks
   ========= */

export const taskApi = {
  async getTasks(filters?: {
    storeId?: number;
    status?: string;
    assigneeId?: number;
    scheduledDate?: Date | string;
  }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.storeId) params.append("storeId", String(filters.storeId));
    if (filters?.status) params.append("status", filters.status);
    if (filters?.assigneeId) params.append("assigneeId", String(filters.assigneeId));
    if (filters?.scheduledDate) {
      const v =
        filters.scheduledDate instanceof Date
          ? filters.scheduledDate.toISOString()
          : String(filters.scheduledDate);
      params.append("scheduledDate", v);
    }
    return apiRequest<Task[]>("GET", `/api/tasks?${params.toString()}`);
  },

  getMyTasks(): Promise<Task[]> {
    return apiRequest<Task[]>("GET", "/api/tasks/my");
  },

  getAvailableTasks(storeId?: number): Promise<Task[]> {
    const params = storeId ? `?storeId=${storeId}` : "";
    return apiRequest<Task[]>("GET", `/api/tasks/available${params}`);
  },

  claimTask(taskId: number, location?: Coords): Promise<Task> {
    return apiRequest<Task>("POST", `/api/tasks/${taskId}/claim`, location);
  },

  transferTask(taskId: number, toUserId: number, reason?: string): Promise<any> {
    return apiRequest("POST", `/api/tasks/${taskId}/transfer`, { toUserId, reason });
  },

  completeTask(
    taskId: number,
    options?: { notes?: string; forceComplete?: boolean; overridePhotoRequirement?: boolean }
  ): Promise<Task> {
    return apiRequest<Task>("POST", `/api/tasks/${taskId}/complete`, options ?? {});
  },

  createTask(taskData: CreateTaskPayload): Promise<Task | Task[]> {
    const body = {
      ...taskData,
      scheduledFor: toIsoIfDate(taskData.scheduledFor),
      dueAt: toIsoIfDate(taskData.dueAt),
    };
    return apiRequest<Task | Task[]>("POST", "/api/tasks", body);
  },

  updateTask(taskId: number, taskData: UpdateTaskPayload): Promise<Task> {
    const body: Record<string, unknown> = { ...taskData };
    if (body.scheduledFor) body.scheduledFor = toIsoIfDate(body.scheduledFor);
    if (body.dueAt) body.dueAt = toIsoIfDate(body.dueAt);
    return apiRequest<Task>("PUT", `/api/tasks/${taskId}`, body);
  },

  deleteTask(taskId: number): Promise<void> {
    return apiRequest<void>("DELETE", `/api/tasks/${taskId}`);
  },

  async uploadPhoto(
    taskId: number,
    file: File,
    location?: Coords,
    taskItemId?: number
  ): Promise<any> {
    const form = new FormData();
    form.append("photo", file);
    if (location) {
      form.append("latitude", String(location.latitude));
      form.append("longitude", String(location.longitude));
    }
    if (taskItemId) form.append("taskItemId", String(taskItemId));

    return apiRequest("POST", `/api/tasks/${taskId}/photos`, form);
  },
};

/* =========
   API – Stores
   ========= */

export const storeApi = {
  getStores(): Promise<Store[]> {
    return apiRequest<Store[]>("GET", "/api/stores");
  },
  getStore(id: number): Promise<Store> {
    return apiRequest<Store>("GET", `/api/stores/${id}`);
  },
  createStore(storeData: Partial<Store>): Promise<Store> {
    return apiRequest<Store>("POST", "/api/stores", storeData);
  },
  updateStore(id: number, updates: Partial<Store>): Promise<Store> {
    return apiRequest<Store>("PUT", `/api/stores/${id}`, updates);
  },
  generateQR(storeId: number): Promise<{ qrCode: string }> {
    return apiRequest<{ qrCode: string }>("POST", `/api/stores/${storeId}/generate-qr`);
  },
  getStoreStats(storeId: number): Promise<TaskStats & UserStats> {
    return apiRequest<TaskStats & UserStats>("GET", `/api/stores/${storeId}/stats`);
  },
};

/* =========
   API – Users
   ========= */

export const userApi = {
  getUsers(storeId?: number): Promise<User[]> {
    const params = storeId ? `?storeId=${storeId}` : "";
    return apiRequest<User[]>("GET", `/api/users${params}`);
  },
  createUser(userData: Partial<User> & { password?: string }): Promise<User> {
    return apiRequest<User>("POST", "/api/users", userData);
  },
  resetPin(userId: number): Promise<{ pin: string }> {
    return apiRequest<{ pin: string }>("PUT", `/api/users/${userId}/reset-pin`);
  },
  // Set exact 4-digit PIN (admin/manager only)
  setPin(userId: number, pin: string) {
    return apiRequest<{ ok: true }>("PUT", `/api/users/${userId}/pin`, { pin });
  },
};

/* =========
   API – Analytics (unchanged)
   ========= */

export const analyticsApi = {
  getTaskStats(storeId?: number, dateFrom?: Date, dateTo?: Date): Promise<TaskStats> {
    const params = new URLSearchParams();
    if (storeId) params.append("storeId", String(storeId));
    if (dateFrom) params.append("dateFrom", dateFrom.toISOString());
    if (dateTo) params.append("dateTo", dateTo.toISOString());
    return apiRequest<TaskStats>("GET", `/api/analytics/tasks?${params.toString()}`);
  },
  getUserStats(storeId?: number): Promise<UserStats> {
    const params = storeId ? `?storeId=${storeId}` : "";
    return apiRequest<UserStats>("GET", `/api/analytics/users${params}`);
  },
};

/* =========
   API – Check-ins (geofence)
   ========= */

  export interface CheckInStatus {
    checkedIn: boolean;
    storeId?: number | null;
    at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radiusM?: number | null;
  }

  // Simple in-memory mock to track check-in status on client
  let lastCheckin: CheckInStatus = { checkedIn: false };

  export const checkinApi = {
    status(): Promise<CheckInStatus> {
      return Promise.resolve(lastCheckin);
    },

    checkInToStore(storeId: number, coords: { latitude: number; longitude: number }): Promise<{ success: true }> {
      lastCheckin = {
        checkedIn: true,
        storeId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        at: new Date().toISOString(),
      };
      return Promise.resolve({ success: true });
    },

    checkOut(): Promise<{ success: true }> {
      lastCheckin = { checkedIn: false };
      return Promise.resolve({ success: true });
    },
  };

/* =========
   Task Lists (original + enhanced helpers)
   ========= */

export interface TaskList {
  id: number;
  name: string;
  description?: string | null;
  createdBy: number;
  recurrenceType?: string | null;
  recurrencePattern?: string | null;
  assigneeType: string; // "store_wide" | "manager" | "specific_employee"
  assigneeId?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplate {
  id: number;
  listId: number;
  title: string;
  description?: string | null;
  photoRequired?: boolean;
  photoCount?: number | null;
  assigneeId?: number | null;
}

export type CreateTaskListPayload = {
  name: string;
  description?: string;
  storeId?: number; // optional; backend will infer for store managers
  assigneeType?: string;
  assigneeId?: number;
  recurrenceType?: string;
  recurrencePattern?: string;
};

export type UpdateTaskListPayload = Partial<CreateTaskListPayload> & {
  name?: string; // allow rename specifically
};

// --- Convenience payload for the /api/task-lists/import "sections" format
export type TaskListImportSectionsPayload = {
  assigneeType: "store_wide" | "manager" | "specific_employee";
  assigneeId?: number | null;
  recurrenceType: "none" | "daily" | "weekly" | "monthly";
  recurrencePattern?: string | null;
  sections: Array<{
    title: string;
    items: Array<{
      title: string;
      description?: string;
      photoRequired?: boolean;
      photoCount?: number;
      assigneeId?: number;
    }>;
  }>;
  // optional defaults when items omit explicit photo rules
  defaultPhotoRequired?: boolean;
  defaultPhotoCount?: number;
};

// Response shape for ensure-task routes
export type EnsureTaskResponse = {
  created: boolean;
  task: any;
};

export const taskListApi = {
  // ----- existing endpoints (kept as-is)
  getLists(): Promise<any[]> {
    return apiRequest<any[]>("GET", "/api/task-lists");
  },
  createList(payload: any): Promise<any> {
    return apiRequest<any>("POST", "/api/task-lists", payload);
  },
  deleteList(id: number): Promise<any> {
    return apiRequest<any>("DELETE", `/api/task-lists/${id}`);
  },
  duplicateList(id: number): Promise<any> {
    return apiRequest<any>("POST", `/api/task-lists/${id}/duplicate`);
  },

  import(payload: {
    list: {
      name: string;
      description?: string;
      assigneeType: "store_wide" | "manager" | "specific_employee";
      assigneeId?: number;
      recurrenceType?: "none" | "daily" | "weekly" | "monthly";
      recurrencePattern?: string;
    };
    templates: Array<{
      title: string;
      description?: string;
      photoRequired?: boolean;
      photoCount?: number;
      priority?: "low" | "normal" | "high";
      items?: Array<{ title: string; description?: string; photoRequired?: boolean; sortOrder?: number }>;
    }>;
    assignToMyStore?: boolean;
  }): Promise<{ success: true; listId: number }> {
    return apiRequest("POST", "/api/task-lists/import", payload);
  },

  // ----- NEW: convenience import using "sections" (matches server routes)
  async importOneList(opts: {
    title: string;
    description?: string;
    items: Array<{ title: string; description?: string; photoRequired?: boolean; photoCount?: number; assigneeId?: number }>;
    defaultPhotoRequired?: boolean;
    defaultPhotoCount?: number;
  }): Promise<{ ok: boolean; created: number; lists: any[] }> {
    const body = {
      sections: [
        {
          title: opts.title,
          items: opts.items,
        },
      ],
      defaultPhotoRequired: !!opts.defaultPhotoRequired,
      defaultPhotoCount:
        typeof opts.defaultPhotoCount === "number" ? opts.defaultPhotoCount : 1,
      description: opts.description,
    };
    return apiRequest("POST", "/api/task-lists/import", body);
  },

  // ----- NEW: import via sections with full control
  importSections(payload: TaskListImportSectionsPayload): Promise<{
    ok?: boolean;
    created?: number;
    lists: any[];
  }> {
    return apiRequest("POST", "/api/task-lists/import", payload);
  },

  // ----- NEW: fetch one list & its templates
  getList(id: number): Promise<TaskList> {
    return apiRequest<TaskList>("GET", `/api/task-lists/${id}`);
  },
  getTemplates(listId: number): Promise<TaskTemplate[]> {
    return apiRequest<TaskTemplate[]>("GET", `/api/task-lists/${listId}/templates`);
  },

  // ----- NEW: today’s tasks for a list+store (employees don’t need “Run”)
  getTodayTasks(listId: number, storeId: number): Promise<any[]> {
    const qs = new URLSearchParams({ storeId: String(storeId) }).toString();
    return apiRequest<any[]>("GET", `/api/task-lists/${listId}/tasks?${qs}`);
  },

  // alias – same as getTodayTasks for readability
  getListTasksForStoreToday(listId: number, storeId: number) {
    return this.getTodayTasks(listId, storeId);
  },

  // ----- ensure today’s task exists – use body-based route for compatibility
  ensureTask(
    listId: number,
    templateId: number,
    storeId?: number
  ): Promise<EnsureTaskResponse> {
    const qs = storeId ? `?storeId=${storeId}` : "";
    return apiRequest<EnsureTaskResponse>(
      "POST",
      `/api/task-lists/${listId}/ensure-task${qs}`,
      { templateId }
    );
  },

  // also expose explicit body-based call (same as ensureTask above)
  ensureTaskViaBody(
    listId: number,
    templateId: number,
    storeId?: number
  ): Promise<EnsureTaskResponse> {
    const qs = storeId ? `?storeId=${storeId}` : "";
    return apiRequest<EnsureTaskResponse>(
      "POST",
      `/api/task-lists/${listId}/ensure-task${qs}`,
      { templateId }
    );
  },

  // ----- update a task list (e.g., to bind a list to a store after import)
  updateList(id: number, payload: UpdateTaskListPayload): Promise<any> {
    return apiRequest<any>("PUT", `/api/task-lists/${id}`, payload);
  },
};
