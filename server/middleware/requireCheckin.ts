import type { Request, Response, NextFunction } from "express";

type ActiveCheckin = {
  storeId: number;
  storeName?: string;
  fence?: { lat: number; lng: number; radiusM: number };
  startedAt: string;
};

export function requireActiveCheckin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session;
  const user = (req as any).user || session?.user;

  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

  const active: ActiveCheckin | undefined = session?.activeCheckin;
  if (!active) {
    return res.status(403).json({ message: "You must check in at the store first" });
  }

  (req as any).activeCheckin = active;
  next();
}
