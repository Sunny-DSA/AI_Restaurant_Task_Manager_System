// server/middleware/requireCheckin.ts
import { Request, Response, NextFunction } from "express";

/**
 * ON by default. To disable in dev:
 *   REQUIRE_CHECKIN=false
 */
const REQUIRE_CHECKIN =
  process.env.REQUIRE_CHECKIN
    ? String(process.env.REQUIRE_CHECKIN).toLowerCase() !== "false"
    : true;

export function requireActiveCheckin(req: Request, res: Response, next: NextFunction) {
  // If disabled, just continue.
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
