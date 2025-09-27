// server/routes/analytics.ts
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { storage } from "../storage";
import { roleEnum, taskStatusEnum } from "@shared/schema";

const r = Router();

/* ------------------------ helpers ------------------------ */

type UserLike = {
  id: number;
  role: string;
  storeId?: number | null;
};

const isAdmin = (u: UserLike) =>
  u.role === roleEnum.MASTER_ADMIN || u.role === roleEnum.ADMIN;
const isManager = (u: UserLike) => u.role === roleEnum.STORE_MANAGER;
const isEmployee = (u: UserLike) => u.role === roleEnum.EMPLOYEE;

function parseNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function coerceDateRange(q: any): { from?: Date; to?: Date } {
  const from = q?.dateFrom ? new Date(String(q.dateFrom)) : undefined;
  const to = q?.dateTo ? new Date(String(q.dateTo)) : undefined;
  const okFrom = from && !Number.isNaN(from.getTime()) ? from : undefined;
  const okTo = to && !Number.isNaN(to.getTime()) ? to : undefined;
  return { from: okFrom, to: okTo };
}

function inRange(d: Date | null | undefined, from?: Date, to?: Date) {
  if (!d) return true; // if no date on task, don't exclude it
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function normalizeDateOnly(d?: string | Date | null) {
  if (!d) return undefined;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? undefined
    : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/* -------------------- scope resolution ------------------- */

async function scopedTasks(me: UserLike, opt: { storeId?: number; from?: Date; to?: Date }) {
  let storeId = opt.storeId;

  // force scope for non-admins
  if (!isAdmin(me)) {
    storeId = me.storeId ?? undefined;
  }

  // fetch tasks by store (if known) or all
  const rows = await storage.getTasks({ storeId });

  // Optional date filter: try scheduledFor first, then dueAt as a fallback
  const { from, to } = opt;
  if (!from && !to) return rows || [];

  return (rows || []).filter((t: any) => {
    const scheduled = t.scheduledFor ? new Date(t.scheduledFor) : null;
    const due = t.dueAt ? new Date(t.dueAt) : null;

    // Prefer scheduledFor if present, otherwise use dueAt
    if (scheduled) return inRange(scheduled, from, to);
    if (due) return inRange(due, from, to);
    return true;
  });
}

async function scopedUsers(me: UserLike, opt: { storeId?: number }) {
  let storeId = opt.storeId;

  if (!isAdmin(me)) {
    storeId = me.storeId ?? undefined;
  }

  // Attempt best-available user lookup by store
  if (storeId && typeof (storage as any).getUsersByStore === "function") {
    const users = await (storage as any).getUsersByStore(storeId);
    return users || [];
  }

  // Fallbacks used elsewhere in your users route
  if (typeof (storage as any).getAllUsers === "function") {
    const all = await (storage as any).getAllUsers();
    if (storeId != null) return (all || []).filter((u: any) => Number(u.storeId) === Number(storeId));
    return all || [];
  }

  // Last-resort: if no helpers, try current user's own record
  if (!isAdmin(me) && me.id) {
    const self = await storage.getUser(me.id);
    return self ? [self] : [];
  }

  return [];
}

async function countCheckedIn(storeId?: number): Promise<number> {
  // If your storage has a check-ins table:
  const s: any = storage as any;
  try {
    if (typeof s.getActiveCheckins === "function") {
      const rows = await s.getActiveCheckins();
      const list = (rows || []).filter((c: any) =>
        storeId == null ? true : Number(c.storeId) === Number(storeId)
      );
      return list.length;
    }
    if (typeof s.getCheckinsByStore === "function" && storeId != null) {
      const list = await s.getCheckinsByStore(storeId);
      return (list || []).filter((c: any) => c.active).length;
    }
  } catch {
    // ignore, fall through
  }
  return 0;
}

/* --------------------- /analytics/tasks -------------------- */

r.get("/analytics/tasks", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user as UserLike;
    const storeId = parseNum(req.query.storeId);
    const { from, to } = coerceDateRange(req.query);

    const tasks = await scopedTasks(me, { storeId, from, to });

    const total = tasks.length;
    const completed = tasks.filter((t: any) => t.status === taskStatusEnum.COMPLETED || t.status === "completed").length;

    const overdue = tasks.filter((t: any) => {
      if (t.status === taskStatusEnum.COMPLETED || t.status === "completed") return false;
      if (!t.dueAt) return false;
      const due = new Date(t.dueAt).getTime();
      return Number.isFinite(due) && due < Date.now();
    }).length;

    // “today” helper (use scheduledFor if present)
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayTasks = tasks.filter((t: any) => {
      const d = t.scheduledFor ? new Date(t.scheduledFor) : (t.dueAt ? new Date(t.dueAt) : null);
      return d ? d.toISOString().slice(0, 10) === todayKey : false;
    });
    const todayCompleted = todayTasks.filter((t: any) => t.status === taskStatusEnum.COMPLETED || t.status === "completed").length;

    const completionRate = total ? (completed / total) * 100 : 0;

    res.json({
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
      completionRate,
      todayTotal: todayTasks.length,
      todayCompleted,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to compute task analytics" });
  }
});

/* --------------------- /analytics/users -------------------- */

r.get("/analytics/users", authenticateToken, async (req: Request, res: Response) => {
  try {
    const me = (req as any).user as UserLike;
    const storeId = parseNum(req.query.storeId);

    const users = await scopedUsers(me, { storeId });

    const totalUsers = users.length;
    const activeUsers = users.filter((u: any) => u.isActive !== false).length;

    // last 24h “recently active” (optional KPI if you want)
    // const now = Date.now();
    // const recentActive = users.filter((u: any) => u.lastLogin && (now - new Date(u.lastLogin).getTime()) < 24*3600e3).length;

    const checkedInUsers = await countCheckedIn(storeId);

    res.json({
      totalUsers,
      activeUsers,
      checkedInUsers,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to compute user analytics" });
  }
});

/* --------------- Optional: one-call overview --------------- */

r.get("/analytics/overview", authenticateToken, async (req: Request, res: Response) => {
  try {
    // proxy to both endpoints to reduce client round-trips if you want
    const me = (req as any).user as UserLike;
    const storeId = parseNum(req.query.storeId);
    const { from, to } = coerceDateRange(req.query);

    const [tasks, users] = await Promise.all([
      (async () => {
        const t = await scopedTasks(me, { storeId, from, to });
        const total = t.length;
        const completed = t.filter((x: any) => x.status === taskStatusEnum.COMPLETED || x.status === "completed").length;
        const overdue = t.filter((x: any) => {
          if (x.status === taskStatusEnum.COMPLETED || x.status === "completed") return false;
          if (!x.dueAt) return false;
          const due = new Date(x.dueAt).getTime();
          return Number.isFinite(due) && due < Date.now();
        }).length;
        const completionRate = total ? (completed / total) * 100 : 0;
        return { total, completed, overdue, completionRate };
      })(),
      (async () => {
        const us = await scopedUsers(me, { storeId });
        const totalUsers = us.length;
        const activeUsers = us.filter((u: any) => u.isActive !== false).length;
        const checkedInUsers = await countCheckedIn(storeId);
        return { totalUsers, activeUsers, checkedInUsers };
      })(),
    ]);

    res.json({
      tasks: {
        totalTasks: tasks.total,
        completedTasks: tasks.completed,
        overdueTasks: tasks.overdue,
        completionRate: tasks.completionRate,
      },
      users,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to compute overview" });
  }
});

export default r;
