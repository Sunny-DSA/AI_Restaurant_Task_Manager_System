import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { taskApi, userApi, storeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Users, Camera, Repeat, Building2, Copy } from "lucide-react";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assigneeType: z.enum(["store_wide", "manager", "specific_employee"]),
  assigneeId: z.number().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  estimatedDuration: z.number().min(1, "Duration must be at least 1 minute"),
  photoRequired: z.boolean().default(false),
  photoCount: z.number().min(1).max(10).default(1),
  scheduledFor: z.string().optional(),
  dueAt: z.string().optional(),
  storeId: z.number(),
  // Recurring task options
  recurrenceType: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  recurrencePattern: z.string().optional(),
  // Multi-store assignment
  assignedStores: z.array(z.number()).default([]),
  createAsTemplate: z.boolean().default(false),
});

type CreateTaskData = z.infer<typeof createTaskSchema>;

interface CreateTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  templateId?: number;
}

export default function CreateTaskDialog({ isOpen, onClose, templateId }: CreateTaskDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateTaskData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      assigneeType: "store_wide",
      priority: "normal",
      estimatedDuration: 30,
      photoRequired: false,
      photoCount: 1,
      recurrenceType: "none",
      assignedStores: [user?.storeId || 0].filter(Boolean),
      createAsTemplate: false,
    },
  });

  // Get task template if templateId is provided
  const { data: template } = useQuery({
    queryKey: ["/api/task-templates", templateId],
    enabled: !!templateId,
  });

  // Get store users for assignment  
  const { data: storeUsers = [] } = useQuery({
    queryKey: ["/api/users", { storeId: user?.storeId }],
    queryFn: () => userApi.getUsers(user?.storeId),
    enabled: !!user?.storeId,
  });

  // Get all stores for multi-store assignment (admin only)
  const { data: allStores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: () => storeApi.getStores(),
    enabled: user?.role === "master_admin" || user?.role === "admin",
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTaskData) => taskApi.createTask(data),
    onSuccess: () => {
      toast({
        title: "Task created successfully",
        description: "The task has been created and is now available for assignment.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onClose();
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Populate form with template data when template loads
  if (template && typeof template === 'object' && 'title' in template) {
    form.setValue("title", (template as any).title);
    form.setValue("description", (template as any).description || "");
    form.setValue("estimatedDuration", (template as any).estimatedDuration || 30);
    form.setValue("photoRequired", (template as any).photoRequired || false);
    form.setValue("photoCount", (template as any).photoCount || 1);
  }

  const onSubmit = (data: CreateTaskData) => {
    createTaskMutation.mutate({
      ...data,
      storeId: user?.storeId!,
    });
  };

  const assigneeType = form.watch("assigneeType");
  const photoRequired = form.watch("photoRequired");
  const recurrenceType = form.watch("recurrenceType");
  const createAsTemplate = form.watch("createAsTemplate");
  const isMultiStoreAdmin = user?.role === "master_admin" || user?.role === "admin";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>{templateId ? "Create Task from Template" : "Create New Task"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                {...form.register("title")}
                placeholder="Enter task title"
                className="mt-1"
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="Provide detailed instructions for this task"
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(value) => form.setValue("priority", value as "low" | "normal" | "high")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="estimatedDuration">Duration (minutes) *</Label>
                <div className="relative mt-1">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="estimatedDuration"
                    type="number"
                    min="1"
                    {...form.register("estimatedDuration", { valueAsNumber: true })}
                    className="pl-10"
                  />
                </div>
                {form.formState.errors.estimatedDuration && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.estimatedDuration.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Assignment</span>
            </h3>

            <div>
              <Label>Assign to</Label>
              <Select
                value={assigneeType}
                onValueChange={(value) => form.setValue("assigneeType", value as any)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store_wide">Anyone at the store</SelectItem>
                  <SelectItem value="manager">Store managers only</SelectItem>
                  <SelectItem value="specific_employee">Specific employee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assigneeType === "specific_employee" && (
              <div>
                <Label>Select Employee</Label>
                <Select
                  value={form.watch("assigneeId")?.toString() || ""}
                  onValueChange={(value) => form.setValue("assigneeId", parseInt(value))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(storeUsers as any[])
                      .filter((u: any) => u.role === "employee" || u.role === "store_manager")
                      .map((storeUser: any) => (
                        <SelectItem key={storeUser.id} value={storeUser.id.toString()}>
                          {storeUser.firstName} {storeUser.lastName} ({storeUser.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Photo Requirements */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center space-x-2">
              <Camera className="w-4 h-4" />
              <span>Photo Requirements</span>
            </h3>

            <div className="flex items-center space-x-2">
              <Switch
                checked={photoRequired}
                onCheckedChange={(checked) => form.setValue("photoRequired", checked)}
                id="photoRequired"
              />
              <Label htmlFor="photoRequired">Require photo verification</Label>
            </div>

            {photoRequired && (
              <div>
                <Label htmlFor="photoCount">Number of photos required</Label>
                <Select
                  value={form.watch("photoCount").toString()}
                  onValueChange={(value) => form.setValue("photoCount", parseInt(value))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} photo{count > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Store Assignment */}
          {isMultiStoreAdmin && (
            <div className="space-y-4">
              <h3 className="font-medium flex items-center space-x-2">
                <Building2 className="w-4 h-4" />
                <span>Store Assignment</span>
              </h3>

              <div>
                <Label>Assign to stores</Label>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {(allStores as any[]).map((store: any) => (
                    <div key={store.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`store-${store.id}`}
                        checked={form.watch("assignedStores").includes(store.id)}
                        onChange={(e) => {
                          const currentStores = form.watch("assignedStores");
                          if (e.target.checked) {
                            form.setValue("assignedStores", [...currentStores, store.id]);
                          } else {
                            form.setValue("assignedStores", currentStores.filter(id => id !== store.id));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor={`store-${store.id}`} className="text-sm font-normal">
                        {store.name} - {store.address}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recurring Options */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center space-x-2">
              <Repeat className="w-4 h-4" />
              <span>Recurrence</span>
            </h3>

            <div>
              <Label>Repeat task</Label>
              <Select
                value={recurrenceType}
                onValueChange={(value) => form.setValue("recurrenceType", value as any)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Never repeat</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recurrenceType !== "none" && (
              <div>
                <Label htmlFor="recurrencePattern">Custom pattern (optional)</Label>
                <Input
                  id="recurrencePattern"
                  {...form.register("recurrencePattern")}
                  placeholder="e.g., Every weekday, Every 2 weeks"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank for standard {recurrenceType} recurrence
                </p>
              </div>
            )}
          </div>

          {/* Template Options */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center space-x-2">
              <Copy className="w-4 h-4" />
              <span>Template Options</span>
            </h3>

            <div className="flex items-center space-x-2">
              <Switch
                checked={createAsTemplate}
                onCheckedChange={(checked) => form.setValue("createAsTemplate", checked)}
                id="createAsTemplate"
              />
              <Label htmlFor="createAsTemplate">Save as reusable template</Label>
            </div>

            {createAsTemplate && (
              <p className="text-sm text-gray-600">
                This task will be saved as a template for future use across stores
              </p>
            )}
          </div>

          {/* Scheduling */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Scheduling (Optional)</span>
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduledFor">Scheduled start</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  {...form.register("scheduledFor")}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="dueAt">Due date</Label>
                <Input
                  id="dueAt"
                  type="datetime-local"
                  {...form.register("dueAt")}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <Button
              type="submit"
              disabled={createTaskMutation.isPending}
              className="flex-1"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}