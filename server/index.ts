// server/index.ts
import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import apiRouter from "./routes"; // <- single aggregated router
import { setupVite, serveStatic } from "./vite";

const app = express();
const isDev = process.env.NODE_ENV !== "production";

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
      secure: !isDev,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// if you’re no longer saving to disk, this is harmless but optional:
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ mount ONE composite router
app.use("/api", apiRouter);

// last-resort error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "File too large. Max 10MB." });
  if (err?.message === "Only image files are allowed") return res.status(415).json({ message: err.message });
  console.error("Unhandled error:", err);
  res.status(500).json({ message: err?.message || "Internal server error" });
});

const PORT = Number(process.env.PORT) || 5000;
async function startServer() {
  const server = createServer(app);
  if (isDev) await setupVite(app, server); else serveStatic(app);
  server.listen(PORT, "0.0.0.0", () => console.log(`Server http://0.0.0.0:${PORT}`));
}
startServer().catch(console.error);
