import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Filter } from "lucide-react";

import { taskApi, userApi, storeApi, Task, User } from "@/lib/api";
import TaskCard from "../components/TaskCard";
import CreateTaskDialog from "../components/CreateTaskDialog";
import { useAuth } from "../hooks/useAuth";

// --- UI Helpers ---
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "primary";
  className?: string;
  disabled?: boolean;
}
const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = "default",
  className = "",
  disabled = false,
}) => {
  const baseClasses = "px-4 py-2 rounded-lg transition-colors font-medium";
  const variantClasses: Record<
    "default" | "outline" | "ghost" | "primary",
    string
  > = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-300 text-gray-600 hover:bg-gray-50",
    ghost: "text-gray-600 hover:bg-gray-100",
    primary: "bg-blue-500 text-white hover:bg-blue-600",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${className} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {children}
    </button>
  );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
const Input: React.FC<InputProps> = ({ className = "", ...props }) => (
  <input
    className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
    {...props}
  />
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary";
  className?: string;
}
const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  className = "",
}) => {
  const variantClasses: Record<"default" | "secondary", string> = {
    default: "bg-blue-100 text-blue-800",
    secondary: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default function Tasks() {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // --- API Queries (TanStack Query v5 syntax) ---
  const { data: allTasks = [], refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["tasks", user?.storeId],
    queryFn: () => taskApi.getTasks({ storeId: user?.storeId }),
    enabled: !!user?.storeId,
  });

  const { data: myTasks = [] } = useQuery<Task[]>({
    queryKey: ["myTasks"],
    queryFn: () => taskApi.getMyTasks(),
  });

  const { data: availableTasks = [] } = useQuery<Task[]>({
    queryKey: ["availableTasks"],
    queryFn: () => taskApi.getAvailableTasks(),
  });

  const { data: employees = [] } = useQuery<User[]>({
    queryKey: ["users", user?.storeId],
    queryFn: () => userApi.getUsers(user?.storeId),
    enabled: !!user?.storeId,
  });

  // --- Filtering logic ---
  const getFilteredTasks = (): Task[] => {
    let tasks: Task[] = [];

    switch (activeFilter) {
      case "my":
        tasks = myTasks;
        break;
      case "available":
        tasks = availableTasks;
        break;
      case "overdue":
        tasks = allTasks.filter((t) => t.status === "overdue");
        break;
      case "completed":
        tasks = allTasks.filter((t) => t.status === "completed");
        break;
      case "in_progress":
        tasks = allTasks.filter(
          (t) => t.status === "claimed" || t.status === "in_progress"
        );
        break;
      default:
        tasks = allTasks;
    }

    if (searchTerm) {
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (t.description &&
            t.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (selectedEmployee) {
      tasks = tasks.filter((t) => String(t.assigneeId) === selectedEmployee);
    }

    if (selectedDate) {
      tasks = tasks.filter((t) => {
        const taskDate = new Date(t.dueAt || t.createdAt).toDateString();
        const filterDate = new Date(selectedDate).toDateString();
        return taskDate === filterDate;
      });
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
        return allTasks.filter((t) => t.status === "overdue").length;
      case "completed":
        return allTasks.filter((t) => t.status === "completed").length;
      case "in_progress":
        return allTasks.filter(
          (t) => t.status === "claimed" || t.status === "in_progress"
        ).length;
      default:
        return allTasks.length;
    }
  };

  const filters = [
    { key: "all", label: "All Tasks" },
    { key: "my", label: "My Tasks" },
    { key: "available", label: "Available" },
    { key: "in_progress", label: "In Progress" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
  ];

  const canShowAdvancedFilters =
    user?.role === "admin" ||
    user?.role === "master_admin" ||
    user?.role === "store_manager";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            {filters.map((f) => (
              <Button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                variant={activeFilter === f.key ? "default" : "outline"}
              >
                {f.label}
                <Badge variant="secondary" className="ml-2">
                  {getFilterBadgeCount(f.key)}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchTerm(e.target.value)
                }
                className="pl-10 pr-4 py-2 w-64"
              />
            </div>

            {canShowAdvancedFilters && (
              <Button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            )}

            {(user?.role === "admin" ||
              user?.role === "store_owner" ||
              user?.role === "master_admin") && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
            )}
          </div>
        </div>

        {canShowAdvancedFilters && showAdvancedFilters && (
          <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Employee
              </label>
              <select
                value={selectedEmployee}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedEmployee(e.target.value)
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Date
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSelectedDate(e.target.value)
                }
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => {
                  setSelectedEmployee("");
                  setSelectedDate("");
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onTaskUpdate={refetchTasks} />
          ))
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-600">
            No tasks found
          </div>
        )}
      </div>

      {/* Create Task Dialog */}
      {showCreateDialog && (
        <CreateTaskDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
