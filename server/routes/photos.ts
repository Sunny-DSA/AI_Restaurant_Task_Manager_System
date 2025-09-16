// server/routes/photos.ts
import { Router } from "express";
import { db } from "../db";
import { taskPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";

const r = Router();

r.get("/photos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const [p] = await db
    .select({ data: taskPhotos.data, mimeType: taskPhotos.mimeType, url: taskPhotos.url })
    .from(taskPhotos)
    .where(eq(taskPhotos.id, id))
    .limit(1);

  if (!p) return res.status(404).json({ message: "Not found" });

  // If you stored a data URL, redirect to it (fastest path for browsers)
  if (p.url) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.redirect(p.url);
  }

  if (!p.data) return res.status(404).json({ message: "Not found" });
  res.setHeader("Content-Type", p.mimeType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(p.data));
});

export default r;
