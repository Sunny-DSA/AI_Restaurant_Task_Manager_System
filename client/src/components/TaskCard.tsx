import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { taskApi, userApi, Task, User } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Clock, User as UserIcon, Camera, UserCheck, ArrowRightLeft, CheckCircle } from "lucide-react";
import TaskDetailsDialog from "./TaskDetailsDialog";

interface TaskCardProps {
  task: Task;
  onTaskUpdate?: () => void;
}

export default function TaskCard({ task, onTaskUpdate }: TaskCardProps) {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [transferUserId, setTransferUserId] = useState<string>("");
  const [transferReason, setTransferReason] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cache store users for assignee labels
  const { data: storeUsers = [] } = useQuery<User[]>({
    queryKey: ["users", user?.storeId],
    queryFn: () => userApi.getUsers(user?.storeId),
    enabled: !!user?.storeId,
    staleTime: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks", user?.storeId] });
    queryClient.invalidateQueries({ queryKey: ["availableTasks", user?.storeId] });
    onTaskUpdate?.();
  };

  const claimTaskMutation = useMutation({
    mutationFn: (location?: { latitude: number; longitude: number }) =>
      taskApi.claimTask(task.id, location),
    onSuccess: () => {
      toast({ title: "Task claimed", description: `You claimed "${task.title}"` });
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to claim task", description: error.message, variant: "destructive" });
    },
  });

  const transferTaskMutation = useMutation({
    mutationFn: () => taskApi.transferTask(task.id, parseInt(transferUserId), transferReason),
    onSuccess: () => {
      toast({ title: "Task transferred", description: "Task transferred to team member" });
      setShowTransferModal(false);
      setTransferUserId("");
      setTransferReason("");
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to transfer task", description: error.message, variant: "destructive" });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: () => taskApi.completeTask(task.id),
    onSuccess: () => {
      toast({ title: "Task completed", description: `"${task.title}" is now complete` });
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to complete task", description: error.message, variant: "destructive" });
    },
  });

  const handleClaimTask = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => claimTaskMutation.mutate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () =>
          toast({
            title: "Location required",
            description: "Please allow location to claim tasks.",
            variant: "destructive",
          })
      );
    } else {
      claimTaskMutation.mutate(undefined);
    }
  };

  const handleTransferTask = () => {
    if (!transferUserId) {
      toast({ title: "Select a user", description: "Pick a team member to transfer to", variant: "destructive" });
      return;
    }
    transferTaskMutation.mutate();
  };

  const getTaskStatusColor = () => {
    switch (task.status) {
      case "completed":
        return "bg-success-100 text-success-700";
      case "in_progress":
      case "claimed":
        return "bg-warning-100 text-warning-700";
      case "overdue":
        return "bg-destructive-100 text-destructive-700";
      case "available":
        return "bg-primary-100 text-primary-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getPriorityColor = () => {
    switch (task.priority) {
      case "high":
        return "bg-destructive-100 text-destructive-700";
      case "normal":
        return "bg-primary-100 text-primary-700";
      case "low":
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return "N/A";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const canClaimTask = () =>
    (task.status === "available" || (task.status === "pending" && task.assigneeType === "store_wide")) &&
    hasPermission(user?.role || "", "complete", "tasks");

  const canTransferTask = () => task.claimedBy === user?.id && task.status !== "completed";
  const canCompleteTask = () => task.claimedBy === user?.id && task.status !== "completed";
  const isMyTask = task.claimedBy === user?.id || task.assigneeId === user?.id;

  const assigneeLabel = (() => {
    if (task.assigneeType === "specific_employee" && task.assigneeId) {
      const found = storeUsers.find((u) => u.id === task.assigneeId);
      if (found)
        return `${found.firstName || ""} ${found.lastName || ""}`.trim() || found.email || `User #${found.id}`;
      return `User #${task.assigneeId}`;
    }
    if (task.assigneeType === "manager") return "Store managers";
    return "Anyone at the store";
  })();

  return (
    <>
      <div
        className={`task-card bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all hover:shadow-md ${
          task.status === "completed" ? "opacity-75" : ""
        } ${task.status === "claimed" && isMyTask ? "task-claimed" : ""} ${
          task.status === "completed" ? "task-completed" : ""
        } ${task.status === "overdue" ? "task-overdue" : ""}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-3">
              <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
              <Badge className={getTaskStatusColor()}>{task.status.replace("_", " ")}</Badge>
              {task.priority !== "normal" && (
                <Badge className={getPriorityColor()}>{task.priority} priority</Badge>
              )}
            </div>

            {task.description && <p className="text-gray-600 mb-4">{task.description}</p>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              {task.dueAt && (
                <div className="flex items-center text-gray-600">
                  <Clock className="w-4 h-4 mr-2" />
                  <span>
                    Due:{" "}
                    {new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}

              <div className="flex items-center text-gray-600">
                <UserIcon className="w-4 h-4 mr-2" />
                <span>{assigneeLabel}</span>
              </div>

              {task.photoRequired && (
                <div className="flex items-center text-gray-600">
                  <Camera className="w-4 h-4 mr-2" />
                  <span>
                    {task.photosUploaded}/{task.photoCount} photos
                  </span>
                </div>
              )}

              {task.estimatedDuration && (
                <div className="flex items-center text-gray-600">
                  <Clock className="w-4 h-4 mr-2" />
                  <span>~{formatDuration(task.estimatedDuration)}</span>
                </div>
              )}
            </div>

            {(task.claimedBy || task.completedBy) && (
              <div className="mb-4">
                {task.claimedBy && task.status !== "completed" && (
                  <div className="flex items-center text-sm text-warning-600 bg-warning-50 px-3 py-2 rounded-lg">
                    <UserCheck className="w-4 h-4 mr-2" />
                    <span>
                      {task.claimedBy === user?.id ? "You are working on this task" : "Task claimed by team member"}
                    </span>
                  </div>
                )}

                {task.completedBy && task.status === "completed" && (
                  <div className="flex items-center text-sm text-success-600 bg-success-50 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span>
                      Completed{" "}
                      {task.actualDuration ? `in ${formatDuration(task.actualDuration)}` : ""}
                      {task.completedAt && ` at ${new Date(task.completedAt).toLocaleTimeString()}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ml-6 flex flex-col space-y-2">
            {canClaimTask() && (
              <Button
                onClick={handleClaimTask}
                disabled={claimTaskMutation.isPending}
                className="bg-primary-600 text-white hover:bg-primary-700"
              >
                {claimTaskMutation.isPending ? "Claiming..." : "Claim Task"}
              </Button>
            )}

            {canCompleteTask() && (
              <Button
                onClick={() => completeTaskMutation.mutate()}
                disabled={completeTaskMutation.isPending}
                className="bg-success-600 text-white hover:bg-success-700"
              >
                {completeTaskMutation.isPending ? "Completing..." : "Complete"}
              </Button>
            )}

            {canTransferTask() && (
              <Button onClick={() => setShowTransferModal(true)} variant="outline" size="sm">
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Transfer
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setShowDetailsDialog(true)}>
              View Details
            </Button>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer to:</label>
              <Select value={transferUserId} onValueChange={setTransferUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {storeUsers
                    .filter((u) => u.id !== user?.id && u.isActive)
                    .map((storeUser) => (
                      <SelectItem key={storeUser.id} value={storeUser.id.toString()}>
                        <div className="flex items-center space-x-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {storeUser.firstName?.[0]}
                              {storeUser.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {storeUser.firstName} {storeUser.lastName}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional):</label>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Why are you transferring this task?"
                rows={3}
              />
            </div>

            <div className="flex space-x-3">
              <Button onClick={handleTransferTask} disabled={transferTaskMutation.isPending || !transferUserId} className="flex-1">
                {transferTaskMutation.isPending ? "Transferring..." : "Transfer Task"}
              </Button>
              <Button variant="outline" onClick={() => setShowTransferModal(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Details Dialog */}
      <TaskDetailsDialog
        open={showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
        task={task}
        currentUserRole={user?.role || ""}
        onUpdated={refresh}
      />
    </>
  );
}
