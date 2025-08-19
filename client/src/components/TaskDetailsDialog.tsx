import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Calendar, Clock, MapPin, User, Camera, Users, Trash2, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { taskApi, userApi, storeApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/auth";

// Define the task update schema
const updateTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assigneeType: z.enum(["store_wide", "department", "role", "specific_user"]),
  assigneeId: z.number().optional(),
  dueAt: z.string().optional(),
  estimatedDuration: z.number().min(0).optional(),
  photoRequired: z.boolean(),
  photoCount: z.number().min(1).max(10),
  storeId: z.number(),
  status: z.enum(["pending", "available", "claimed", "in_progress", "completed", "overdue", "cancelled"]),
});

type UpdateTaskData = z.infer<typeof updateTaskSchema>;

interface TaskDetailsDialogProps {
  task: any;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate?: () => void;
}

export default function TaskDetailsDialog({ task, isOpen, onClose, onTaskUpdate }: TaskDetailsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Check permissions
  const canEdit = hasPermission(user?.role || "", "update", "tasks");
  const canDelete = hasPermission(user?.role || "", "delete", "tasks");

  // Get store users for assignment
  const { data: storeUsers = [] } = useQuery({
    queryKey: ["/api/users", { storeId: task?.storeId }],
    queryFn: () => userApi.getUsers(task?.storeId),
    enabled: !!task?.storeId && isEditing,
  });

  // Get all stores for reassignment (admin only)
  const { data: allStores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: () => storeApi.getStores(),
    enabled: (user?.role === "master_admin" || user?.role === "admin") && isEditing,
  });

  const form = useForm<UpdateTaskData>({
    resolver: zodResolver(updateTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "normal",
      assigneeType: "store_wide",
      estimatedDuration: 30,
      photoRequired: false,
      photoCount: 1,
      storeId: 1,
      status: "pending",
    },
  });

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "normal",
        assigneeType: task.assigneeType || "store_wide",
        assigneeId: task.assigneeId,
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : "",
        estimatedDuration: task.estimatedDuration || 30,
        photoRequired: task.photoRequired || false,
        photoCount: task.photoCount || 1,
        storeId: task.storeId || 1,
        status: task.status || "pending",
      });
    }
  }, [task, form]);

  const updateTaskMutation = useMutation({
    mutationFn: (data: UpdateTaskData) => {
      const updateData: any = { ...data };
      if (updateData.dueAt) {
        updateData.dueAt = new Date(updateData.dueAt).toISOString();
      }
      return taskApi.updateTask(task.id, updateData);
    },
    onSuccess: () => {
      toast({
        title: "Task updated successfully",
        description: "The task has been updated with your changes.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/available"] });
      setIsEditing(false);
      onTaskUpdate?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => taskApi.deleteTask(task.id),
    onSuccess: () => {
      toast({
        title: "Task deleted successfully",
        description: "The task has been permanently deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/available"] });
      onClose();
      onTaskUpdate?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: UpdateTaskData) => {
    updateTaskMutation.mutate(data);
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteTaskMutation.mutate();
    setShowDeleteDialog(false);
  };

  const getStatusColor = () => {
    switch (task?.status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
      case "claimed":
        return "bg-blue-100 text-blue-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  const getPriorityColor = () => {
    switch (task?.priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "low":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (!task) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Task Details</span>
              <div className="flex gap-2">
                <Badge className={getStatusColor()}>
                  {task.status?.replace("_", " ")}
                </Badge>
                {task.priority !== "normal" && (
                  <Badge className={getPriorityColor()}>
                    {task.priority} priority
                  </Badge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Task title" data-testid="input-task-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Task description (optional)" 
                          rows={3}
                          data-testid="textarea-task-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="claimed">Claimed</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-priority">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="assigneeType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-assignee-type">
                              <SelectValue placeholder="Select assignment type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="store_wide">Store Wide</SelectItem>
                            <SelectItem value="department">Department</SelectItem>
                            <SelectItem value="role">Role</SelectItem>
                            <SelectItem value="specific_user">Specific User</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("assigneeType") === "specific_user" && (
                    <FormField
                      control={form.control}
                      name="assigneeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign To</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(Number(value))} 
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-assignee">
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {storeUsers.map((u: any) => (
                                <SelectItem key={u.id} value={u.id.toString()}>
                                  {u.firstName} {u.lastName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {(user?.role === "master_admin" || user?.role === "admin") && (
                  <FormField
                    control={form.control}
                    name="storeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Store</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(Number(value))} 
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-store">
                              <SelectValue placeholder="Select store" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allStores.map((store: any) => (
                              <SelectItem key={store.id} value={store.id.toString()}>
                                {store.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dueAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date & Time</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="datetime-local" 
                            data-testid="input-due-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estimatedDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min="0"
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            data-testid="input-duration"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <FormField
                    control={form.control}
                    name="photoRequired"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-photo-required"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Photo Required</FormLabel>
                      </FormItem>
                    )}
                  />

                  {form.watch("photoRequired") && (
                    <FormField
                      control={form.control}
                      name="photoCount"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Number of Photos</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="1"
                              max="10"
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              data-testid="input-photo-count"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <DialogFooter className="flex justify-between">
                  <div className="flex gap-2">
                    {canDelete && (
                      <Button 
                        type="button" 
                        variant="destructive" 
                        onClick={handleDelete}
                        disabled={deleteTaskMutation.isPending}
                        data-testid="button-delete-task"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Task
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updateTaskMutation.isPending}
                      data-testid="button-save-task"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{task.title}</h3>
                {task.description && (
                  <p className="text-gray-600 mb-4">{task.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <User className="w-4 h-4 mr-2 text-gray-500" />
                    <span className="font-medium">Assignment:</span>
                    <span className="ml-2">{task.assigneeType?.replace("_", " ")}</span>
                  </div>

                  {task.dueAt && (
                    <div className="flex items-center text-sm">
                      <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Due:</span>
                      <span className="ml-2">
                        {new Date(task.dueAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {task.estimatedDuration && (
                    <div className="flex items-center text-sm">
                      <Clock className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Duration:</span>
                      <span className="ml-2">{formatDuration(task.estimatedDuration)}</span>
                    </div>
                  )}

                  {task.photoRequired && (
                    <div className="flex items-center text-sm">
                      <Camera className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Photos:</span>
                      <span className="ml-2">
                        {task.photosUploaded || 0}/{task.photoCount} required
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {task.claimedBy && (
                    <div className="flex items-center text-sm">
                      <User className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Claimed By:</span>
                      <span className="ml-2">
                        {task.claimedBy === user?.id ? "You" : "Team Member"}
                      </span>
                    </div>
                  )}

                  {task.claimedAt && (
                    <div className="flex items-center text-sm">
                      <Clock className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Claimed At:</span>
                      <span className="ml-2">
                        {new Date(task.claimedAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {task.completedAt && (
                    <div className="flex items-center text-sm">
                      <Clock className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Completed:</span>
                      <span className="ml-2">
                        {new Date(task.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {task.actualDuration && (
                    <div className="flex items-center text-sm">
                      <Clock className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="font-medium">Actual Duration:</span>
                      <span className="ml-2">{formatDuration(task.actualDuration)}</span>
                    </div>
                  )}
                </div>
              </div>

              {task.completionNotes && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Completion Notes:</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    {task.completionNotes}
                  </p>
                </div>
              )}

              <DialogFooter className="flex justify-between">
                <div className="flex gap-2">
                  {canDelete && (
                    <Button 
                      variant="destructive" 
                      onClick={handleDelete}
                      disabled={deleteTaskMutation.isPending}
                      data-testid="button-delete-task"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Task
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={onClose}
                    data-testid="button-close-details"
                  >
                    Close
                  </Button>
                  {canEdit && task.status !== "completed" && (
                    <Button 
                      onClick={() => setIsEditing(true)}
                      data-testid="button-edit-task"
                    >
                      Edit Task
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the task "{task?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}