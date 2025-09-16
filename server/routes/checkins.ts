// server/routes/checkins.ts
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";

const r = Router();

/** Return current session's check-in snapshot. */
r.get("/checkins/me", authenticateToken, (req: Request, res: Response) => {
  const active = (req as any).session?.activeCheckin;
  if (!active) return res.json({ checkedIn: false });

  // Keep it simple; frontends only need the flag + a bit of context
  res.json({
    checkedIn: true,
    storeId: active.storeId ?? null,
    storeName: active.storeName ?? null,
    at: active.startedAt ?? null,
    // Optional fence echo (handy for debugging; harmless if unused on client)
    latitude: active.fence?.lat ?? null,
    longitude: active.fence?.lng ?? null,
    radiusM: active.fence?.radiusM ?? null,
  });
});

export default r;
