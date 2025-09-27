// client/src/pages/AdminDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { storeApi, taskApi, analyticsApi, taskListApi, Task, Store } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CheckSquare, Users, AlertTriangle, TrendingUp,
} from "lucide-react";
import TaskCard from "@/components/TaskCard";

export default function AdminDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "master_admin";

  // Load stores for the filter
  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    queryFn: storeApi.getStores,
    enabled: isAdmin, // only admins need all stores
  });

  // Selected store
  const [storeId, setStoreId] = useState<number | null>(null);

  // Default selection once stores load
  useEffect(() => {
    if (!isAdmin) return;
    if (storeId == null) {
      if (user?.storeId) setStoreId(user.storeId);
      else if (stores.length > 0) setStoreId(stores[0].id);
    }
  }, [stores, user, isAdmin, storeId]);

  // Ensure today's tasks exist for the selected store (idempotent)
  useEffect(() => {
    if (storeId == null) return;
    taskListApi.ensureForStore(storeId).catch(() => {
      // non-blocking
    });
  }, [storeId]);

  // Analytics & data
  const { data: taskStats } = useQuery({
    queryKey: ["/api/analytics/tasks", storeId],
    queryFn: () => analyticsApi.getTaskStats(storeId ?? undefined),
    enabled: storeId != null,
  });

  const { data: userStats } = useQuery({
    queryKey: ["/api/analytics/users", storeId],
    queryFn: () => analyticsApi.getUserStats(storeId ?? undefined),
    enabled: storeId != null,
  });

  // IMPORTANT: keys start with ["tasks", storeId] so TaskCard invalidations refresh these.
  // Fetch TODAY only data for dashboard widgets.
  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", storeId, "all", "today"],
    queryFn: () => taskApi.getTasks({ storeId: storeId ?? undefined, todayOnly: true }),
    enabled: storeId != null,
  });

  const { data: availableTasks = [] } = useQuery<Task[]>({
    queryKey: ["availableTasks", storeId, "today"],
    queryFn: () => taskApi.getAvailableTasks(storeId ?? undefined, true),
    enabled: storeId != null,
  });

  // Derived lists (already "today" scoped, but keep logic consistent)
  const todayStr = new Date().toDateString();

  const todaysTasks = useMemo(() => {
    return allTasks.filter((t) => {
      const d = t.dueAt ? new Date(t.dueAt) : t.scheduledFor ? new Date(t.scheduledFor) : new Date();
      return d.toDateString() === todayStr;
    });
  }, [allTasks, todayStr]);

  const completedToday = todaysTasks.filter((t) => t.status === "completed").length;
  const overdueCount = allTasks.filter((t) => t.status === "overdue").length;

  const recentCompletions = useMemo(() => {
    return [...allTasks]
      .filter((t) => t.status === "completed" && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 6);
  }, [allTasks]);

  const upcomingOrOverdue = useMemo(() => {
    const now = Date.now();
    return [...allTasks]
      .filter((t) => {
        const due = t.dueAt ? new Date(t.dueAt).getTime() : null;
        if (!due) return false;
        // show overdue or due within 24h
        return due < now || due - now < 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const ad = a.dueAt ? new Date(a.dueAt).getTime() : 0;
        const bd = b.dueAt ? new Date(b.dueAt).getTime() : 0;
        return ad - bd;
      })
      .slice(0, 6);
  }, [allTasks]);

  const CurrentStoreName = useMemo(() => {
    const found = stores.find((s) => s.id === storeId);
    return found?.name ?? "Store";
  }, [stores, storeId]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header with Store Filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground">Monitor performance across the selected store.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[220px]">
            <Select
              value={storeId != null ? String(storeId) : ""}
              onValueChange={(v) => setStoreId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasks Today</p>
                <p className="text-2xl font-bold">{todaysTasks.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-emerald-700 font-medium">{completedToday} completed</span>
              <span className="text-muted-foreground ml-1">
                • {todaysTasks.length - completedToday} pending
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">
                  {taskStats ? Math.round(taskStats.completionRate) : 0}%
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-700" />
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-emerald-600 h-2 rounded-full"
                  style={{ width: `${taskStats ? taskStats.completionRate : 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Staff</p>
                <p className="text-2xl font-bold">
                  {userStats?.checkedInUsers ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-700" />
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">Currently checked in</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">
                  {overdueCount}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="mt-2 text-sm font-medium">
              {overdueCount > 0 ? (
                <span className="text-red-600">Needs attention</span>
              ) : (
                <span className="text-emerald-700">All caught up</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: recent completions + upcoming/overdue */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Completions — {CurrentStoreName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCompletions.length === 0 && (
              <div className="text-sm text-muted-foreground">No recent completions.</div>
            )}
            {recentCompletions.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdue / Due Soon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingOrOverdue.length === 0 && (
              <div className="text-sm text-muted-foreground">Nothing urgent right now.</div>
            )}
            {upcomingOrOverdue.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Available to claim */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Available to Claim — {CurrentStoreName}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableTasks.length === 0 && (
            <div className="text-sm text-muted-foreground">Nothing available to claim.</div>
          )}
          {availableTasks.slice(0, 10).map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
