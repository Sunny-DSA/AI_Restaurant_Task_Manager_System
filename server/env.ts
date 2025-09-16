// server/env.ts
import "dotenv/config";

/** Robust boolean parser: true/false, 1/0, yes/no, on/off (case-insensitive) */
function toBool(v: unknown, fallback: boolean): boolean {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

export const NODE_ENV = process.env.NODE_ENV || "development";
export const SESSION_SECRET =
  process.env.SESSION_SECRET || "please-change-me-32chars-min";

// Geofence / check-in toggles (use sane defaults)
export const REQUIRE_CHECKIN = toBool(process.env.REQUIRE_CHECKIN, true);
// default to true only in production if not set
export const ENFORCE_GEOFENCE = toBool(
  process.env.ENFORCE_GEOFENCE,
  NODE_ENV === "production"
);

// Database
export const DATABASE_URL = process.env.DATABASE_URL;
export const SQLITE_PATH = process.env.SQLITE_PATH;

// ---- One-time startup log (safe; won’t crash even if undefined)
console.log("[env] Loaded", {
  NODE_ENV,
  REQUIRE_CHECKIN,
  ENFORCE_GEOFENCE,
  HAS_DATABASE_URL: !!DATABASE_URL,
  SQLITE_PATH,
});
