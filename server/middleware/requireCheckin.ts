// server/middleware/requireCheckin.ts
import { Request, Response, NextFunction } from "express";
import { REQUIRE_CHECKIN } from "../env";

/**
 * Guard: requires an active check-in snapshot in the session
 * when REQUIRE_CHECKIN is true.
 */
export function requireActiveCheckin(req: Request, res: Response, next: NextFunction) {
  // If disabled, allow through.
  if (!REQUIRE_CHECKIN) return next();

  const active = (req as any).session?.activeCheckin as
    | {
        storeId: number;
        storeName?: string;
        fence?: { lat: number; lng: number; radiusM: number };
        startedAt?: string;
      }
    | undefined;

  if (!active || !active.fence) {
    // Debug once per miss
    console.warn("[requireActiveCheckin] Missing or invalid session check-in", {
      hasSession: !!(req as any).session,
      hasActive: !!active,
      fence: active?.fence ?? null,
    });
    return res.status(403).json({ message: "Check-in required at the store to continue." });
  }

  (req as any).activeCheckin = active;
  return next();
}
