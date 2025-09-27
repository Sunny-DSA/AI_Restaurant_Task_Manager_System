import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { storage } from "../storage";
import { AuthService } from "../services/authService";
import { roleEnum } from "@shared/schema";

const r = Router();

r.get("/users", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user!;
    const qStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const isAdmin = me.role === roleEnum.MASTER_ADMIN || me.role === roleEnum.ADMIN;

    const includeMe = async (arr: any[]) => {
      const meFull = await storage.getUser(me.id);
      if (meFull && !arr.find((u) => u.id === meFull.id)) arr.push(meFull);
    };

    if (isAdmin) {
      if (qStoreId) {
        let list: any[] = [];
        if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(qStoreId);
        await includeMe(list);
        return res.json(list || []);
      }
      if (typeof (storage as any).getAllUsers === "function") {
        const all = await (storage as any).getAllUsers();
        await includeMe(all);
        return res.json(all || []);
      }
      const stores = (await storage.getStores()) || [];
      const out: any[] = [];
      for (const s of stores) {
        if (typeof (storage as any).getUsersByStore === "function") {
          const list = await (storage as any).getUsersByStore(s.id);
          for (const u of list || []) if (!out.find((x) => x.id === u.id)) out.push(u);
        }
      }
      await includeMe(out);
      return res.json(out);
    }

    if (me.role === roleEnum.STORE_MANAGER) {
      if (!me.storeId) {
        const onlyMe = await storage.getUser(me.id);
        return res.json(onlyMe ? [onlyMe] : []);
      }
      let list: any[] = [];
      if (typeof (storage as any).getUsersByStore === "function") list = await (storage as any).getUsersByStore(me.storeId);
      await includeMe(list);
      return res.json(list || []);
    }

    const self = await storage.getUser(me.id);
    return res.json(self ? [self] : []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch users" });
  }
});

r.post(
  "/users",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
    try {
      const me = (req as any).user!;
      const b = (req.body ?? {}) as {
        firstName?: string;
        lastName?: string;
        email?: string;
        role: string;
        storeId?: number | null;
        password?: string;
      };

      const role = String(b.role || "").toLowerCase();

      // Require store for store-bound roles
      const needsStore =
        role === roleEnum.STORE_MANAGER || role === roleEnum.EMPLOYEE;
      if (needsStore && (b.storeId == null || !Number.isFinite(Number(b.storeId)))) {
        return res.status(400).json({ message: "Store is required for employees and store managers" });
      }

      // Store manager can only create users for their own store
      if (me.role === roleEnum.STORE_MANAGER) {
        if (!me.storeId) {
          return res.status(403).json({ message: "Store assignment required to create users" });
        }
        if (needsStore && Number(b.storeId) !== Number(me.storeId)) {
          return res.status(403).json({ message: "Cannot create users for a different store" });
        }
        // Store managers may not create admins
        if (role === roleEnum.ADMIN || role === roleEnum.MASTER_ADMIN) {
          return res.status(403).json({ message: "Store managers cannot create admins" });
        }
      }

      // Require password for admin / master_admin (if that’s your policy)
      if ((role === roleEnum.ADMIN || role === roleEnum.MASTER_ADMIN) && !b.password) {
        return res.status(400).json({ message: "Password is required for admin accounts" });
      }

      const created = await AuthService.createUser(
        {
          ...b,
          storeId: needsStore ? Number(b.storeId) : null,
        } as any,
        b.password
      );

      return res.json(created);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to create user" });
    }
  }
);


r.put(
  "/users/:id/pin",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN, roleEnum.STORE_MANAGER]),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const pin: string = String(req.body?.pin ?? "");
      if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: "PIN must be exactly 4 digits" });

      const me = (req as any).user;
      if (me.role === roleEnum.STORE_MANAGER) {
        const target = await storage.getUser(id);
        if (!target) return res.status(404).json({ message: "User not found" });
        if (target.storeId !== me.storeId) return res.status(403).json({ message: "Forbidden" });
      }
      await AuthService.setUserPin(id, pin);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to set PIN" });
    }
  }
);

export default r;
