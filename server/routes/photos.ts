import { Router } from "express";
import { db } from "../db";
import { taskPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";

const r = Router();

r.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.sendStatus(400);

  const [p] = await db.select().from(taskPhotos).where(eq(taskPhotos.id, id)).limit(1);
  if (!p?.data) return res.sendStatus(404);

  res.setHeader("Content-Type", p.mimeType ?? "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(p.data));
});

export default r;
