// server/middleware/requireCheckin.ts
import { Request, Response, NextFunction } from "express";

const REQUIRE_CHECKIN =
  process.env.REQUIRE_CHECKIN !== undefined
    ? process.env.REQUIRE_CHECKIN === "False"
    : false; // default ON for safety

export function requireActiveCheckin(req: Request, res: Response, next: NextFunction) {
  if (!REQUIRE_CHECKIN) return next();

  const active = (req as any).session?.activeCheckin as
    | { storeId: number; storeName?: string; fence?: { lat: number; lng: number; radiusM: number } }
    | undefined;

  if (!active || !active.fence) {
    return res.status(403).json({ message: "Check-in required at the store to continue." });
  }

  (req as any).activeCheckin = active;
  next();
}
