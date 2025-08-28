// server/index.ts
import express from "express";
import session from "express-session";
import path from "path";
import cors from "cors";
import routes from "./routes";

const app = express();

// CORS for the Vite client (credentials = cookies/session)
app.use(
  cors({
    origin: true,          // reflect request origin
    credentials: true,     // allow cookies
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (dev-safe config; adjust for prod)
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,                   // set true if behind HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
  })
);

// serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// mount API
app.use("/api", routes);

// Multer error handler (size/type)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "File too large. Max 10MB." });
  if (err?.message === "Only image files are allowed") return res.status(415).json({ message: err.message });
  if (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
  res.end();
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});