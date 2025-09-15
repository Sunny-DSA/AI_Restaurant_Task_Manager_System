import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";
import { db } from "../db";
import { sql } from "drizzle-orm";

const r = Router();

r.get("/admin/task-previews",
  authenticateToken,
  requireRole(["admin", "master_admin"]),
  async (_req, res) => {
    const rows = await db.execute(sql`
      SELECT t.id, t.title, t.description, t.created_at,
             u.first_name AS created_by_name,
             u.role       AS created_by_role,
             (SELECT tp.id FROM task_photos tp
                WHERE tp.task_id = t.id AND tp.data IS NOT NULL
                ORDER BY tp.uploaded_at ASC LIMIT 1) AS preview_photo_id,
             (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id) AS subtask_count,
             (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id AND i.is_completed = true) AS done_count
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      ORDER BY t.created_at DESC
      LIMIT 50;
    `);
    res.json(rows.rows);
  }
);

export default r;
