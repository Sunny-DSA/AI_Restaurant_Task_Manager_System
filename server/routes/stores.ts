// server/routes/stores.ts
import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { storage } from "../storage";
import { roleEnum } from "@shared/schema";

const r = Router();

/** List stores the caller can see */
r.get("/stores", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role === roleEnum.MASTER_ADMIN || user.role === roleEnum.ADMIN) {
      const stores = await storage.getStores();
      return res.json(stores || []);
    }
    if (user.storeId) {
      const store = await storage.getStore(user.storeId);
      return res.json(store ? [store] : []);
    }
    return res.json([]);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch stores" });
  }
});

/** Get one store (role-gated) */
r.get("/stores/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    const user = (req as any).user;
    const isAdmin = user.role === roleEnum.MASTER_ADMIN || user.role === roleEnum.ADMIN;
    if (!isAdmin && user.storeId !== storeId) {
      return res.status(403).json({ message: "Unauthorized to view this store" });
    }
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch store" });
  }
});

/** Create store (admins only) */
r.post(
  "/stores",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const newStore = await storage.createStore(req.body);
      res.status(201).json(newStore);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to create store" });
    }
  }
);

/** Update store (admins only) */
r.put(
  "/stores/:id",
  authenticateToken,
  requireRole([roleEnum.MASTER_ADMIN, roleEnum.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const storeId = Number(req.params.id);
      const updated = await storage.updateStore(storeId, req.body);
      if (!updated) return res.status(404).json({ message: "Store not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update store" });
    }
  }
);

export default r;
