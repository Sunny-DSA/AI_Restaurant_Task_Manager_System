// server/index.ts
import express from "express";
import session from "express-session";
import path from "path";
import cors from "cors";
import routes from "./routes";
import { createServer } from "http";
import { setupVite, serveStatic } from "./vite";

const app = express();

app.use(
  cors({
    origin: true,          // reflect request origin (Vite dev and prod)
    credentials: true,     // 🔑 allow cookies
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true behind HTTPS in production
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// API routes (after session!)
app.use("/api", routes);

// last-resort error handler (e.g., Multer)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "File too large. Max 10MB." });
  if (err?.message === "Only image files are allowed") return res.status(415).json({ message: err.message });
  if (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
  res.end();
});

const isDev = process.env.NODE_ENV !== "production";
const PORT = Number(process.env.API_PORT ?? process.env.PORT) || 5000;

async function startServer() {
  const server = createServer(app);
  
  if (isDev) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
