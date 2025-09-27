// client/src/pages/EmployeeDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { taskApi, analyticsApi, taskListApi, Task } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, Users, AlertTriangle, QrCode } from "lucide-react";
import QRScanner from "@/components/QRScanner";
import TaskCard from "@/components/TaskCard";

export default function EmployeeDashboard() {
  const { user, checkIn } = useAuth();
  const [showQR, setShowQR] = useState(false);

  // Ensure today's tasks exist for this store (idempotent — safe to call on mount).
  useEffect(() => {
    if (!user?.storeId) return;
    taskListApi.ensureForStore(user.storeId).catch(() => {
      // non-blocking; dashboards still render even if ensure fails
    });
  }, [user?.storeId]);

  // Store KPIs for the employee's store
  const { data: taskStats } = useQuery({
    queryKey: ["/api/analytics/tasks", user?.storeId],
    queryFn: () => analyticsApi.getTaskStats(user?.storeId),
    enabled: !!user?.storeId,
  });

  // My tasks = direct + store-wide (server already merges). Fetch TODAY only.
  // Key starts with ["tasks", user?.storeId] so TaskCard invalidations refresh it.
  const { data: myTasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", user?.storeId, "mine", "today"],
    queryFn: () => taskApi.getMyTasksToday(),
    enabled: true,
  });

  // Derived KPI values
  const todayStr = new Date().toDateString();
  const todaysTasks = useMemo(() => {
    // The API already returns only today's tasks, but keep this to be resilient.
    return myTasks.filter((t) => {
      const d = t.dueAt ? new Date(t.dueAt) : t.scheduledFor ? new Date(t.scheduledFor) : new Date();
      return d.toDateString() === todayStr;
    });
  }, [myTasks, todayStr]);

  const completedToday = todaysTasks.filter((t) => t.status === "completed").length;
  const overdueCount = myTasks.filter((t) => t.status === "overdue").length;

  const handleQRSuccess = (storeId: number) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          checkIn({
            storeId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => checkIn({ storeId })
      );
    } else {
      checkIn({ storeId });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Employee Dashboard</h2>
          <p className="text-muted-foreground">Your tasks and store-wide work for today.</p>
        </div>
        <Button variant="outline" onClick={() => setShowQR(true)}>
          <QrCode className="w-4 h-4 mr-2" />
          Scan QR to Check In
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasks Today</p>
                <p className="text-2xl font-bold">{todaysTasks.length}</p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-emerald-700 font-medium">{completedToday} completed</span>
              <span className="text-muted-foreground ml-1">• {todaysTasks.length - completedToday} pending</span>
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
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-emerald-700" />
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
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="mt-2 text-sm font-medium">
              {overdueCount > 0 ? (
                <span className="text-red-600">Needs attention</span>
              ) : (
                <span className="text-emerald-700">All good</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Checked In</p>
                <p className="text-2xl font-bold">{user?.storeId ? 1 : 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-700" />
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              You must be on premises to upload photos or complete tasks.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My & Store-wide tasks (full TaskCard UI) */}
      <Card>
        <CardHeader>
          <CardTitle>My & Store-Wide Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {myTasks.length === 0 && (
            <div className="text-sm text-muted-foreground">Nothing assigned yet.</div>
          )}
          {myTasks.slice(0, 50).map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </CardContent>
      </Card>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        onSuccess={(sid) => handleQRSuccess(sid)}
      />
    </div>
  );
}
