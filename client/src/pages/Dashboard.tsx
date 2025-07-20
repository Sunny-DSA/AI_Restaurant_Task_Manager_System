import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { taskApi, analyticsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TaskCard from "@/components/TaskCard";
import QRScanner from "@/components/QRScanner";
import { CheckSquare, Clock, Users, AlertTriangle, QrCode, Plus, UserPlus, Download } from "lucide-react";

export default function Dashboard() {
  const { user, checkIn } = useAuth();
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Get task stats
  const { data: taskStats } = useQuery({
    queryKey: ["/api/analytics/tasks", user?.storeId],
    queryFn: () => analyticsApi.getTaskStats(user?.storeId),
    enabled: !!user?.storeId,
  });

  // Get user stats
  const { data: userStats } = useQuery({
    queryKey: ["/api/analytics/users", user?.storeId],
    queryFn: () => analyticsApi.getUserStats(user?.storeId),
    enabled: !!user?.storeId,
  });

  // Get priority tasks
  const { data: priorityTasks = [] } = useQuery({
    queryKey: ["/api/tasks/my"],
    queryFn: () => taskApi.getMyTasks(),
  });

  // Get available tasks for claiming
  const { data: availableTasks = [] } = useQuery({
    queryKey: ["/api/tasks/available"],
    queryFn: () => taskApi.getAvailableTasks(),
    enabled: !!user?.storeId,
  });

  const handleQRSuccess = (storeId: number, storeName: string) => {
    // Get current location for check-in
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          checkIn({
            storeId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          checkIn({ storeId });
        }
      );
    } else {
      checkIn({ storeId });
    }
  };

  const todaysTasks = priorityTasks.filter(task => {
    const today = new Date().toDateString();
    const taskDate = task.dueAt ? new Date(task.dueAt).toDateString() : today;
    return taskDate === today;
  });

  const completedToday = todaysTasks.filter(task => task.status === "completed").length;
  const overdueCount = priorityTasks.filter(task => task.status === "overdue").length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tasks Today</p>
                <p className="text-2xl font-bold text-gray-900">{todaysTasks.length}</p>
              </div>
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-primary-600" />
              </div>
            </div>
            <div className="mt-2 flex items-center text-sm">
              <span className="text-success-600 font-medium">{completedToday} completed</span>
              <span className="text-gray-500 ml-1">• {todaysTasks.length - completedToday} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {taskStats ? Math.round(taskStats.completionRate) : 0}%
                </p>
              </div>
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-success-600" />
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-success-500 h-2 rounded-full" 
                  style={{ width: `${taskStats ? taskStats.completionRate : 0}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Staff</p>
                <p className="text-2xl font-bold text-gray-900">
                  {userStats?.checkedInUsers || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-warning-600" />
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              Currently checked in
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{overdueCount}</p>
              </div>
              <div className="w-12 h-12 bg-destructive-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
            </div>
            <div className="mt-2 text-sm text-destructive font-medium">
              {overdueCount > 0 ? "Needs attention" : "All caught up"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Priority Tasks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Priority Tasks</CardTitle>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {priorityTasks.slice(0, 3).length > 0 ? (
              priorityTasks.slice(0, 3).map((task) => (
                <div key={task.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">{task.title}</h4>
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                      <div className="flex items-center space-x-4 text-xs">
                        <span className={`flex items-center ${
                          task.status === "overdue" 
                            ? "text-destructive" 
                            : task.status === "claimed" || task.status === "in_progress"
                            ? "text-warning-600"
                            : "text-primary-600"
                        }`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {task.status === "overdue" 
                            ? "Overdue" 
                            : task.dueAt 
                            ? `Due ${new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : "No due date"
                          }
                        </span>
                        {task.photoRequired && (
                          <span className="flex items-center text-gray-500">
                            <QrCode className="w-3 h-3 mr-1" />
                            Photo required
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-3">
                      {task.status === "available" && (
                        <div className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                          Available
                        </div>
                      )}
                      {task.status === "claimed" && (
                        <div className="px-2 py-1 bg-warning-100 text-warning-700 text-xs font-medium rounded-full">
                          Claimed
                        </div>
                      )}
                      {task.status === "completed" && (
                        <div className="px-2 py-1 bg-success-100 text-success-700 text-xs font-medium rounded-full">
                          Complete
                        </div>
                      )}
                      {task.status === "overdue" && (
                        <div className="px-2 py-1 bg-destructive-100 text-destructive-700 text-xs font-medium rounded-full">
                          Overdue
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <CheckSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No priority tasks at the moment</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => setShowQRScanner(true)}
              className="w-full flex items-center justify-start p-4 h-auto border-2 border-dashed border-primary-200 bg-transparent hover:border-primary-300 hover:bg-primary-50 text-left"
            >
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
                <QrCode className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Scan QR to Check In</h4>
                <p className="text-sm text-gray-600">Start your shift and view assigned tasks</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full flex items-center justify-start p-4 h-auto"
            >
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mr-4">
                <Plus className="w-6 h-6 text-success-600" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900">Create New Task</h4>
                <p className="text-sm text-gray-600">Add a custom task or checklist</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full flex items-center justify-start p-4 h-auto"
            >
              <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mr-4">
                <UserPlus className="w-6 h-6 text-warning-600" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900">Invite Team Member</h4>
                <p className="text-sm text-gray-600">Send invitation to new staff</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full flex items-center justify-start p-4 h-auto"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                <Download className="w-6 h-6 text-gray-600" />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900">Export Report</h4>
                <p className="text-sm text-gray-600">Download task completion data</p>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Available Tasks Section */}
      {availableTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Tasks to Claim</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableTasks.slice(0, 2).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onSuccess={handleQRSuccess}
      />
    </div>
  );
}
