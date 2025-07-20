import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { taskApi } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import TaskCard from "@/components/TaskCard";
import { Search, Plus, Filter } from "lucide-react";

export default function Tasks() {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Get all tasks based on user role and permissions
  const { data: allTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["/api/tasks", user?.storeId],
    queryFn: () => taskApi.getTasks({ storeId: user?.storeId }),
    enabled: !!user?.storeId,
  });

  // Get user's specific tasks
  const { data: myTasks = [] } = useQuery({
    queryKey: ["/api/tasks/my"],
    queryFn: () => taskApi.getMyTasks(),
  });

  // Get available tasks for claiming
  const { data: availableTasks = [] } = useQuery({
    queryKey: ["/api/tasks/available"],
    queryFn: () => taskApi.getAvailableTasks(),
    enabled: !!user?.storeId && hasPermission(user?.role || "", "complete", "tasks"),
  });

  const getFilteredTasks = () => {
    let tasks = [];

    switch (activeFilter) {
      case "my":
        tasks = myTasks;
        break;
      case "available":
        tasks = availableTasks;
        break;
      case "overdue":
        tasks = allTasks.filter(task => task.status === "overdue");
        break;
      case "completed":
        tasks = allTasks.filter(task => task.status === "completed");
        break;
      case "in_progress":
        tasks = allTasks.filter(task => 
          task.status === "claimed" || task.status === "in_progress"
        );
        break;
      default:
        tasks = allTasks;
    }

    // Apply search filter
    if (searchTerm) {
      tasks = tasks.filter(task =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    return tasks;
  };

  const filteredTasks = getFilteredTasks();

  const getFilterBadgeCount = (filter: string) => {
    switch (filter) {
      case "my":
        return myTasks.length;
      case "available":
        return availableTasks.length;
      case "overdue":
        return allTasks.filter(task => task.status === "overdue").length;
      case "completed":
        return allTasks.filter(task => task.status === "completed").length;
      case "in_progress":
        return allTasks.filter(task => 
          task.status === "claimed" || task.status === "in_progress"
        ).length;
      default:
        return allTasks.length;
    }
  };

  const filters = [
    { key: "all", label: "All Tasks", available: true },
    { key: "my", label: "My Tasks", available: true },
    { key: "available", label: "Available", available: hasPermission(user?.role || "", "complete", "tasks") },
    { key: "in_progress", label: "In Progress", available: true },
    { key: "overdue", label: "Overdue", available: true },
    { key: "completed", label: "Completed", available: true },
  ].filter(filter => filter.available);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Task Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex flex-wrap gap-3">
              {filters.map((filter) => {
                const count = getFilterBadgeCount(filter.key);
                return (
                  <Button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key)}
                    variant={activeFilter === filter.key ? "default" : "outline"}
                    className={`relative ${
                      activeFilter === filter.key 
                        ? "bg-primary-600 text-white" 
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {filter.label}
                    {count > 0 && (
                      <Badge 
                        variant="secondary" 
                        className="ml-2 bg-white/20 text-current"
                      >
                        {count}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64"
                />
              </div>
              
              {hasPermission(user?.role || "", "create", "tasks") && (
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Task
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <div className="space-y-4">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onTaskUpdate={() => {
                refetchTasks();
              }}
            />
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {activeFilter === "available" ? (
                  <Plus className="w-8 h-8 text-gray-400" />
                ) : (
                  <Filter className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm 
                  ? "No tasks found" 
                  : activeFilter === "available"
                  ? "No available tasks"
                  : `No ${activeFilter === "all" ? "" : activeFilter + " "}tasks`
                }
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm 
                  ? `No tasks match "${searchTerm}". Try adjusting your search terms.`
                  : activeFilter === "available"
                  ? "All tasks are currently claimed or there are no tasks assigned to your store."
                  : activeFilter === "my"
                  ? "You don't have any tasks assigned to you right now."
                  : "There are no tasks in this category at the moment."
                }
              </p>
              
              {!searchTerm && activeFilter === "available" && hasPermission(user?.role || "", "complete", "tasks") && (
                <Button onClick={() => setActiveFilter("all")} variant="outline">
                  View All Tasks
                </Button>
              )}
              
              {!searchTerm && hasPermission(user?.role || "", "create", "tasks") && (
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Task
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
