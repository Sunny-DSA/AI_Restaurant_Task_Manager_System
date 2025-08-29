// server/index.ts
import express from "express";
import session from "express-session";
import path from "path";
import routes from "./routes";

const app = express();

// Parse bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (adjust for prod as needed)
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true if you run behind HTTPS + want secure cookies
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// --- API ---
app.use("/api", routes);

// --- Static React build ---
// 1) Make sure you `npm run build` first (Vite output path must match).
const clientDir = path.join(process.cwd(), "dist", "public");
app.use(express.static(clientDir));

// SPA fallback (send index.html for any non-API route)
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

// --- Start ---
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
