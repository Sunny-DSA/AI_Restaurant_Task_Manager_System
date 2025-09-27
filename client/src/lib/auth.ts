// client/src/lib/auth.ts
export const roleDisplayNames: Record<string, string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  store_manager: "Store Manager",
  employee: "Employee",
};

export const roleColors: Record<string, string> = {
  master_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  store_manager: "bg-green-100 text-green-700",
  employee: "bg-gray-100 text-gray-700",
};

/**
 * Phase-1 rule:
 * - ONLY admins can create/update/delete/import task lists.
 * - Store managers should have the SAME surface as employees (Dashboard, Tasks, Task Lists).
 */
export function hasPermission(
  userRole: string,
  action: string,
  module: string
): boolean {
  const permissions: Record<string, Record<string, string[]>> = {
    master_admin: {
      stores: ["create", "read", "update", "delete"],
      users: ["create", "read", "update", "delete"],
      tasks: ["create", "read", "update", "assign", "complete"],
      task_lists: ["create", "read", "update", "delete", "import", "run"],
      templates: ["create", "read", "update", "delete"],
      reports: ["read", "export"],
    },
    admin: {
      stores: ["create", "read", "update"],
      users: ["create", "read", "update"],
      tasks: ["create", "read", "update", "assign", "complete"],
      task_lists: ["create", "read", "update", "delete", "import", "run"],
      templates: ["create", "read", "update"],
      reports: ["read", "export"],
    },

    // 👇 Store manager == Employee (no Stores/Users/Reports modules)
    store_manager: {
      tasks: ["read", "complete"],
      task_lists: ["read"],
    },
    employee: {
      tasks: ["read", "complete"],
      task_lists: ["read"],
    },
  };

  const userPerms = permissions[userRole];
  const modulePerms = userPerms?.[module];
  return !!modulePerms && modulePerms.includes(action);
}

/**
 * Page access:
 * - Admins (admin/master_admin): all pages.
 * - store_manager and employee: ONLY dashboard, tasks, task_lists.
 */
export function canAccessPage(userRole: string, page: string): boolean {
  const pagePermissions: Record<string, string[]> = {
    dashboard: ["master_admin", "admin", "store_manager", "employee"],
    tasks: ["master_admin", "admin", "store_manager", "employee"],
    task_lists: ["master_admin", "admin", "store_manager", "employee"],
    // Admin-only pages:
    stores: ["master_admin", "admin"],
    users: ["master_admin", "admin"],
    reports: ["master_admin", "admin"],
    admin: ["master_admin", "admin"], // for any /admin/* utilities (e.g., photo feed)
  };
  const allowed = pagePermissions[page];
  return allowed ? allowed.includes(userRole) : false;
}
