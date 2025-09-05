// server/services/authService.ts
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { InsertUser, roleEnum } from "@shared/schema";

function generate4DigitPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export class AuthService {
  /** Email + password login (admins/managers) */
  static async authenticateWithEmail(email: string, password: string) {
    const normEmail = String(email || "").trim().toLowerCase();
    if (!normEmail || !password) throw new Error("Invalid credentials");

    const user = await storage.getUserByEmail(normEmail);
    if (!user || !user.passwordHash) throw new Error("Invalid credentials");

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error("Invalid credentials");

    if (!user.isActive) throw new Error("Account is disabled");

    await storage.updateUser(user.id, { lastLogin: new Date() });
    return user;
  }

  /** Store PIN login (employees/managers) */
  static async authenticateWithPin(pin: string, storeId: number) {
    const normPin = String(pin || "").trim();
    const sid = Number(storeId);
    if (!normPin || !Number.isFinite(sid)) throw new Error("Invalid PIN or store");

    const user = await storage.getUserByPin(normPin, sid);
    if (!user) throw new Error("Invalid PIN or store");
    if (!user.isActive) throw new Error("Account is disabled");

    await storage.updateUser(user.id, { lastLogin: new Date() });
    return user;
  }

  /**
   * Create user.
   * - If `password` provided, hashes it (for admin roles).
   * - For STORE_MANAGER / EMPLOYEE, generates a unique 4-digit PIN per store.
   *
   * Note: Some builds see InsertUser as `{}` due to type inference across aliases.
   * We safely access needed fields via `(userData as any)` to avoid TS property errors.
   */
  static async createUser(userData: InsertUser, password?: string) {
    // Safely pluck the fields we need (avoid TS complaining about `{}`)
    const role: string | undefined = (userData as any)?.role;
    const storeIdRaw = (userData as any)?.storeId;
    const storeId: number | undefined =
      storeIdRaw == null ? undefined : Number(storeIdRaw);

    let passwordHash: string | undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    let pin: string | undefined;
    if (role === roleEnum.STORE_MANAGER || role === roleEnum.EMPLOYEE) {
      if (storeId) {
        let candidate = generate4DigitPin();
        // ensure uniqueness within the same store
        // eslint-disable-next-line no-await-in-loop
        while (await storage.getUserByPin(candidate, storeId)) {
          candidate = generate4DigitPin();
        }
        pin = candidate;
      } else {
        // still assign a PIN if no storeId yet
        pin = generate4DigitPin();
      }
    }

    const created = await storage.createUser({
      ...(userData as any),
      passwordHash,
      pin,
    } as any);

    return created;
  }

  /** Update a user's password (hashes new password) */
  static async updateUserPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return storage.updateUser(userId, { passwordHash });
  }

  /** Reset a user's PIN (ensures uniqueness per store) */
  static async resetUserPin(userId: number) {
    const user = await storage.getUser(userId);
    if (!user || !user.storeId) {
      throw new Error("User not found or not assigned to store");
    }

    let newPin = generate4DigitPin();
    // ensure unique pin in this store
    // eslint-disable-next-line no-await-in-loop
    while (await storage.getUserByPin(newPin, user.storeId)) {
      newPin = generate4DigitPin();
    }

    await storage.updateUser(userId, { pin: newPin });
    return { pin: newPin };
  }


  /** Set a user's 4-digit PIN (ensures uniqueness within their store) */
  static async setUserPin(userId: number, pin: string) {
    const normalized = String(pin).trim();
    if (!/^\d{4}$/.test(normalized)) {
      throw new Error("PIN must be exactly 4 digits");
    }

    const target = await storage.getUser(userId);
    if (!target) throw new Error("User not found");

    // If user belongs to a store, ensure no one else in that store has this PIN
    if (target.storeId) {
      const conflict = await storage.getUserByPin(normalized, target.storeId);
      if (conflict && conflict.id !== userId) {
        throw new Error("PIN already in use for this store");
      }
    }

    await storage.updateUser(userId, { pin: normalized });
    return { pin: normalized };
  }

  /** Simple permission matrix (optional helper for UI/backoffice) */
  static hasPermission(userRole: string, action: string, module: string): boolean {
    const permissions: Record<string, Record<string, string[]>> = {
      [roleEnum.MASTER_ADMIN]: {
        stores: ["create", "read", "update", "delete"],
        users: ["create", "read", "update", "delete"],
        tasks: ["create", "read", "update", "delete", "assign"],
        templates: ["create", "read", "update", "delete"],
        reports: ["read", "export"],
      },
      [roleEnum.ADMIN]: {
        stores: ["read", "update"],
        users: ["create", "read", "update"],
        tasks: ["create", "read", "update", "assign"],
        templates: ["create", "read", "update"],
        reports: ["read", "export"],
      },
      [roleEnum.STORE_MANAGER]: {
        stores: ["read"],
        users: ["read"],
        tasks: ["create","read", "update", "assign", "complete"],
        tasklists: ["create", "read", "update"],
        templates: ["read"],
        reports: ["read"],
      },
      [roleEnum.EMPLOYEE]: {
        tasks: ["read", "complete"],
      },
    };

    const userPermissions = permissions[userRole];
    if (!userPermissions) return false;
    const modulePermissions = userPermissions[module];
    if (!modulePermissions) return false;
    return modulePermissions.includes(action);
  }

  /**
   * Dual login (optional helper) – supports either admin (email+password)
   * or store (storeId + employeeId) flows. Not required by routes, but kept
   * for UI compatibility if you use it anywhere.
   */
  static async dualLogin(credentials: {
    email?: string;
    password?: string;
    storeId?: number;
    employeeId?: number;
  }) {
    const { email, password, storeId, employeeId } = credentials;

    if (email && password) {
      const user = await this.authenticateWithEmail(email, password);
      return {
        id: user.id,
        role: user.role,
        storeId: user.storeId || null,
      };
    }

    if (storeId && employeeId) {
      const store = await storage.getStore(Number(storeId));
      const employee = await storage.getUser(Number(employeeId));

      if (!store || !employee || employee.storeId !== store.id) {
        throw new Error("Invalid store login");
      }
      if (!employee.isActive) throw new Error("Employee account is disabled");

      await storage.updateUser(employee.id, { lastLogin: new Date() });

      return {
        id: employee.id,
        role: employee.role,
        storeId: store.id,
      };
    }

    throw new Error("Incomplete login credentials");
  }
}
