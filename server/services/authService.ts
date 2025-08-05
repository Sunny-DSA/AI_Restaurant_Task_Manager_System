import bcrypt from "bcrypt";
import { storage } from "../storage";
import { InsertUser, roleEnum } from "@shared/schema";

export class AuthService {
  static async authenticateWithEmail(email: string, password: string) {
    const user = await storage.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    if (!user.isActive) {
      throw new Error("Account is disabled");
    }

    // Update last login
    await storage.updateUser(user.id, { lastLogin: new Date() });

    return user;
  }

  static async authenticateWithPin(pin: string, storeId: number) {
    const user = await storage.getUserByPin(pin, storeId);
    if (!user) {
      throw new Error("Invalid PIN or store");
    }

    if (!user.isActive) {
      throw new Error("Account is disabled");
    }

    // Update last login
    await storage.updateUser(user.id, { lastLogin: new Date() });

    return user;
  }

  static async createUser(userData: InsertUser, password?: string) {
    // Hash password if provided (for admin roles)
    let passwordHash: string | undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Generate PIN for store roles
    let pin: string | undefined;
    if (
      userData.role === roleEnum.STORE_MANAGER ||
      userData.role === roleEnum.EMPLOYEE
    ) {
      pin = this.generatePin();
      // Ensure PIN is unique for the store
      while (
        userData.storeId &&
        (await storage.getUserByPin(pin, userData.storeId))
      ) {
        pin = this.generatePin();
      }
    }

    return await storage.createUser({
      ...userData,
      passwordHash,
      pin,
    });
  }

  static async updateUserPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return await storage.updateUser(userId, { passwordHash });
  }

  static async resetUserPin(userId: number) {
    const user = await storage.getUser(userId);
    if (!user || !user.storeId) {
      throw new Error("User not found or not assigned to store");
    }

    let newPin = this.generatePin();
    while (await storage.getUserByPin(newPin, user.storeId)) {
      newPin = this.generatePin();
    }

    return await storage.updateUser(userId, { pin: newPin });
  }

  private static generatePin(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  static hasPermission(
    userRole: string,
    action: string,
    module: string
  ): boolean {
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
        tasks: ["read", "update", "assign", "complete"],
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

  // ✅ Dual Login Method Added
  static async dualLogin(credentials: any) {
    const { email, password, storeId, employeeId } = credentials;

    // Admin login
    if (email && password) {
      const user = await this.authenticateWithEmail(email, password);
      return {
        id: user.id,
        role: user.role,
        storeId: user.storeId || null,
      };
    }

    // Store login
    if (storeId && employeeId) {
      const store = await storage.getStore(storeId);
      const employee = await storage.getUser(employeeId);

      if (!store || !employee || employee.storeId !== store.id) {
        throw new Error("Invalid store login");
      }

      if (!employee.isActive) {
        throw new Error("Employee account is disabled");
      }

      // Update last login
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
