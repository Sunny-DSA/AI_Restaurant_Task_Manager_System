// server/index.ts
import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import apiRouter from "./routes"; // <- single aggregated router
import { setupVite, serveStatic } from "./vite";
import "./env"; // load .env before anything reads env vars

// quick boot log to verify env flags
console.log("[boot env]", {
  NODE_ENV: process.env.NODE_ENV,
  REQUIRE_CHECKIN: process.env.REQUIRE_CHECKIN,
  ENFORCE_GEOFENCE: process.env.ENFORCE_GEOFENCE,
});

const app = express();
const isDev = process.env.NODE_ENV !== "production";

// behind a proxy (Replit/Heroku/etc.)
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" })); // allow data URLs if any
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isDev ? "lax" : "none",
      secure: !isDev, // secure cookies only in production
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

// static (harmless even if you moved to data URLs)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ mount ONE composite router
app.use("/api", apiRouter);

// last-resort error handler
app.use(
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({ message: "File too large. Max 10MB." });
    if (err?.message === "Only image files are allowed")
      return res.status(415).json({ message: err.message });
    console.error("Unhandled error:", err);
    res.status(500).json({ message: err?.message || "Internal server error" });
  }
);

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  const server = createServer(app);

  // Dev uses Vite middleware + HMR on the same HTTP server
  if (isDev) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // 🔊 Listen ONCE (do NOT also call app.listen)
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
