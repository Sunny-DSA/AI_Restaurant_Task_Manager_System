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

export function hasPermission(userRole: string, action: string, module: string): boolean {
  const permissions: Record<string, Record<string, string[]>> = {
    master_admin: {
      stores: ["create", "read", "update", "delete"],
      users: ["create", "read", "update", "delete"],
      tasks: ["create", "read", "update", "delete", "assign"],
      templates: ["create", "read", "update", "delete"],
      reports: ["read", "export"],
    },
    admin: {
      stores: ["create","read", "update"],
      users: ["create", "read", "update"],
      tasks: ["create", "read", "update", "assign"],
      templates: ["create", "read", "update"],
      reports: ["read", "export"],
    },
    store_manager: {
      stores: ["read"],
      users: ["read"],
      tasks: ["read", "update", "assign", "complete"],
      templates: ["read"],
      reports: ["read"],
    },
    employee: {
      tasks: ["read", "complete"],
    },
  };

  const userPermissions = permissions[userRole];
  if (!userPermissions) return false;

  const modulePermissions = userPermissions[module];
  if (!modulePermissions) return false;

  return modulePermissions.includes(action);
}

export function canAccessPage(userRole: string, page: string): boolean {
  const pagePermissions: Record<string, string[]> = {
    dashboard: ["master_admin", "admin", "store_manager", "employee"],
    tasks: ["master_admin", "admin", "store_manager", "employee"],
    stores: ["master_admin", "admin", "store_manager"],
    users: ["master_admin", "admin", "store_manager"],
    reports: ["master_admin", "admin", "store_manager"],
  };

  const allowedRoles = pagePermissions[page];
  return allowedRoles ? allowedRoles.includes(userRole) : false;
}
