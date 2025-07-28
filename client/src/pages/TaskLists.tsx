import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, List, Repeat, Users, Building2, Edit, Trash2, Copy } from "lucide-react";

export default function TaskLists() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingList, setEditingList] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Get all task lists
  const { data: taskLists = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/task-lists"],
    enabled: hasPermission(user?.role || "", "view", "tasks"),
  });

  // Get all stores for assignment
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    enabled: user?.role === "master_admin" || user?.role === "admin",
  });

  const createListMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/task-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task list created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task list", description: error.message, variant: "destructive" });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: number) => {
      const response = await fetch(`/api/task-lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task list deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete task list", description: error.message, variant: "destructive" });
    },
  });

  const duplicateListMutation = useMutation({
    mutationFn: async (listId: number) => {
      const response = await fetch(`/api/task-lists/${listId}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task list duplicated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/task-lists"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to duplicate task list", description: error.message, variant: "destructive" });
    },
  });

  const filteredLists = taskLists.filter((list: any) =>
    list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (list.description && list.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case "daily": return "Daily";
      case "weekly": return "Weekly";
      case "monthly": return "Monthly";
      default: return "One-time";
    }
  };

  const getAssigneeLabel = (type: string, assigneeId?: number) => {
    switch (type) {
      case "store_wide": return "All employees";
      case "manager": return "Managers only";
      case "specific_employee": return "Specific employee";
      default: return "Unassigned";
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Lists</h1>
          <p className="text-gray-600">Create and manage reusable task lists for your stores</p>
        </div>
        
        {hasPermission(user?.role || "", "create", "tasks") && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Task List
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <List className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search task lists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Task Lists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredLists.map((list: any) => (
          <Card key={list.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{list.name}</CardTitle>
                  {list.description && (
                    <p className="text-sm text-gray-600 mt-1">{list.description}</p>
                  )}
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicateListMutation.mutate(list.id)}
                    disabled={duplicateListMutation.isPending}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingList(list)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteListMutation.mutate(list.id)}
                    disabled={deleteListMutation.isPending}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Recurrence:</span>
                  <Badge variant="secondary" className="flex items-center space-x-1">
                    <Repeat className="w-3 h-3" />
                    <span>{getRecurrenceLabel(list.recurrenceType)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Assigned to:</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{getAssigneeLabel(list.assigneeType, list.assigneeId)}</span>
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Templates:</span>
                  <span className="text-sm font-medium">{list.templateCount || 0}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Stores:</span>
                  <span className="text-sm font-medium">{list.storeCount || 0}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <Button variant="outline" className="w-full" size="sm">
                  <Building2 className="w-4 h-4 mr-2" />
                  Manage Templates
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLists.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <List className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? "No task lists found" : "No task lists yet"}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? `No task lists match "${searchTerm}"`
                : "Create your first task list to group related tasks together"
              }
            </p>
            {!searchTerm && hasPermission(user?.role || "", "create", "tasks") && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Task List
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Task List Dialog */}
      <CreateTaskListDialog
        isOpen={showCreateDialog || !!editingList}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingList(null);
        }}
        existingList={editingList}
        stores={stores}
        onSubmit={(data) => createListMutation.mutate(data)}
        isLoading={createListMutation.isPending}
      />
    </div>
  );
}

interface CreateTaskListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  existingList?: any;
  stores: any[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}

function CreateTaskListDialog({ isOpen, onClose, existingList, stores, onSubmit, isLoading }: CreateTaskListDialogProps) {
  const [formData, setFormData] = useState({
    name: existingList?.name || "",
    description: existingList?.description || "",
    assigneeType: existingList?.assigneeType || "store_wide",
    assigneeId: existingList?.assigneeId || null,
    recurrenceType: existingList?.recurrenceType || "none",
    recurrencePattern: existingList?.recurrencePattern || "",
    assignedStores: existingList?.assignedStores || [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existingList ? "Edit Task List" : "Create New Task List"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">List Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Opening Checklist, Closing Procedures"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this task list is for"
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Default Assignment</Label>
            <Select
              value={formData.assigneeType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, assigneeType: value }))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store_wide">All employees</SelectItem>
                <SelectItem value="manager">Managers only</SelectItem>
                <SelectItem value="specific_employee">Specific employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Recurrence</Label>
            <Select
              value={formData.recurrenceType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, recurrenceType: value }))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">One-time</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.recurrenceType !== "none" && (
            <div>
              <Label htmlFor="recurrencePattern">Custom Pattern (optional)</Label>
              <Input
                id="recurrencePattern"
                value={formData.recurrencePattern}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrencePattern: e.target.value }))}
                placeholder="e.g., Weekdays only, Every 2 weeks"
                className="mt-1"
              />
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={isLoading || !formData.name} className="flex-1">
              {isLoading ? "Saving..." : existingList ? "Update List" : "Create List"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}