import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { withinFence } from "../utils/geo";
import { storage } from "../storage";
import { AuthService } from "../services/authService";

const ENFORCE_GEOFENCE =
  process.env.ENFORCE_GEOFENCE !== undefined
    ? process.env.ENFORCE_GEOFENCE === "true"
    : process.env.NODE_ENV === "production";

const r = Router();

/** email/password OR pin+storeId (with optional geofence check) */
r.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password, pin, storeId, rememberMe, latitude, longitude } = req.body ?? {};
    let user: any;

    if (email && password) {
      try {
        user = await AuthService.authenticateWithEmail(String(email), String(password));
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
        if (msg.includes("invalid password")) return res.status(401).json({ message: "Incorrect password. Please try again." });
        return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
      }
    } else if (pin && storeId) {
      const store = await storage.getStore(Number(storeId));
      if (!store) return res.status(404).json({ message: "Store not found." });

      const hasFence =
        store.latitude != null && store.longitude != null &&
        store.geofenceRadius != null && Number(store.geofenceRadius) > 0;

      if (hasFence && ENFORCE_GEOFENCE) {
        const lat = Number(latitude), lng = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return res.status(400).json({ message: "Location required for store login. Please enable location services and try again." });
        }
        const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
        if (!ok) return res.status(403).json({ message: "Outside store geofence. Please log in inside the store radius." });
      }

      try {
        user = await AuthService.authenticateWithPin(String(pin), Number(storeId));
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("incorrect pin")) return res.status(401).json({ message: "Incorrect PIN. Please try again." });
        if (msg.includes("user not found")) return res.status(401).json({ message: "No account found with these credentials." });
        return res.status(401).json({ message: "Login failed. Please check your credentials and try again." });
      }
    } else {
      return res.status(400).json({ message: "Please provide valid login details." });
    }

    (req.session as any).userId = user.id;
    (req.session as any).role = user.role;
    if (rememberMe === true) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

    return res.json({
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, storeId: user.storeId,
    });
  } catch {
    return res.status(500).json({ message: "Unexpected error during login. Please try again." });
  }
});

r.get("/auth/me", authenticateToken, (req: Request, res: Response) => {
  res.json((req as any).user);
});

r.post("/auth/logout", (req: Request, res: Response) => {
  const COOKIE = "sid";
  try {
    req.session?.destroy(() => {
      res.clearCookie(COOKIE);
      res.status(200).json({ ok: true });
    });
  } catch {
    res.clearCookie(COOKIE);
    res.status(200).json({ ok: true });
  }
});

/** QR – simple JSON payload {storeId} */
r.post("/auth/verify-qr", async (req: Request, res: Response) => {
  try {
    const { qrData } = req.body ?? {};
    const payload = JSON.parse(String(qrData));
    const id = Number(payload?.storeId);
    if (!id) return res.status(400).json({ message: "Invalid QR" });
    const store = await storage.getStore(id);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json({ success: true, storeId: id, storeName: store.name });
  } catch {
    res.status(400).json({ message: "Invalid QR" });
  }
});

/** Check-in (captures geofence snapshot in session) */
r.post("/auth/checkin", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });

  const { storeId, latitude, longitude } = req.body ?? {};
  if (!storeId) return res.status(400).json({ message: "storeId required" });

  const store = await storage.getStore(Number(storeId));
  if (!store) return res.status(404).json({ message: "Store not found" });

  if (store.latitude != null && store.longitude != null && store.geofenceRadius) {
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Location required for geofenced check-in" });
    }
    const ok = withinFence({ lat, lng }, { lat: Number(store.latitude), lng: Number(store.longitude) }, Number(store.geofenceRadius));
    if (!ok) return res.status(403).json({ message: "Outside store geofence" });
  }

  const snapshotFence =
    store.latitude != null && store.longitude != null && store.geofenceRadius
      ? { lat: Number(store.latitude), lng: Number(store.longitude), radiusM: Number(store.geofenceRadius) }
      : undefined;

  (req as any).session.activeCheckin = {
    storeId: Number(storeId),
    storeName: store.name,
    fence: snapshotFence,
    startedAt: new Date().toISOString(),
  };
  if ((storage as any).setActiveCheckin) (storage as any).setActiveCheckin(user.id, (req as any).session.activeCheckin);
  res.json({ success: true });
});

r.post("/auth/checkout", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number } | undefined;
  if (!user?.id) return res.status(401).json({ message: "Unauthenticated" });
  (req as any).session.activeCheckin = undefined;
  if ((storage as any).clearActiveCheckin) (storage as any).clearActiveCheckin(user.id);
  res.json({ success: true });
});

export default r;
