import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { userApi, storeApi } from "@/lib/api";
import { hasPermission, roleDisplayNames, roleColors } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users as UsersIcon,
  UserCheck,
  Watch,
  UserPlus,
  Search,
  Mail,
  Upload,
  Plus,
  Shield,
  Key,
} from "lucide-react";

/* -------------------------- validation (unchanged UI) -------------------------- */
const userSchema = z.object({
  email: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().email()
    )
    .optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["master_admin", "admin", "store_manager", "employee"]),
  // coerce "" | string -> number; allow undefined for non-store roles
  storeId: z
    .preprocess((v) => {
      if (v === "" || v == null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }, z.number())
    .optional(),
  password: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(6, "Password must be at least 6 characters")
    )
    .optional(),
});
type UserFormData = z.infer<typeof userSchema>;

export default function Users() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Manual PIN state
  const [setPinManually, setSetPinManually] = useState(false);
  const [manualPin, setManualPin] = useState("");

  // Store selection for admins creating store roles (when they themselves don't have a storeId)
  const [selectedStoreId, setSelectedStoreId] = useState<number | undefined>(undefined);

  const canManageUsers = hasPermission(user?.role || "", "create", "users");
  const canViewAllUsers = user?.role === "master_admin" || user?.role === "admin";

  // Users
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users", canViewAllUsers ? "all" : user?.storeId ?? "none"],
    queryFn: () => userApi.getUsers(canViewAllUsers ? undefined : user?.storeId),
    enabled: canManageUsers,
  });

  // Stores
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: () => storeApi.getStores(),
    enabled: canManageUsers,
  });

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "employee",
      storeId: user?.storeId,
      password: "",
    },
  });

  // Mutations
  const createUserMutation = useMutation({ mutationFn: userApi.createUser });
  const resetPinMutation = useMutation({
    mutationFn: userApi.resetPin,
    onSuccess: (result) => {
      toast({ title: "PIN reset successfully", description: `New PIN: ${result.pin}` });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/users",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset PIN", description: error.message, variant: "destructive" });
    },
  });

  /* ------------------------------ submit (explicit) ----------------------------- */
  const submitForm = async () => {
    // always run (no native form submit)
    const data = form.getValues(); // RHF state snapshot
    const role = data.role;
    const requiresStore = role === "employee" || role === "store_manager";

    const finalStoreId =
      requiresStore ? (user?.storeId ?? selectedStoreId ?? data.storeId) : undefined;

    if (requiresStore && !finalStoreId) {
      toast({
        title: "Select a store",
        description: "Employees and store managers must belong to a store.",
        variant: "destructive",
      });
      return;
    }

    let pinToSet: string | undefined;
    if (setPinManually && requiresStore) {
      const sanitized = (manualPin || "").replace(/\D/g, "").slice(0, 4);
      if (!/^\d{4}$/.test(sanitized)) {
        toast({ title: "PIN must be 4 digits", variant: "destructive" });
        return;
      }
      pinToSet = sanitized;
    }

    const payload: any = {
      ...data,
      storeId: requiresStore ? Number(finalStoreId) : undefined,
      password: role === "master_admin" || role === "admin" ? data.password : undefined,
    };

    try {
      const newUser = await createUserMutation.mutateAsync(payload);

      if (pinToSet) {
        await userApi.setPin(newUser.id, pinToSet);
        toast({ title: "User created", description: `PIN set to ${pinToSet}.` });
      } else {
        toast({
          title: "User created successfully",
          description: `${newUser.firstName} ${newUser.lastName} has been added`,
        });
      }

      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/users",
      });

      setShowCreateModal(false);
      form.reset({
        email: "",
        firstName: "",
        lastName: "",
        role: "employee",
        storeId: user?.storeId,
        password: "",
      });
      setSetPinManually(false);
      setManualPin("");
      setSelectedStoreId(undefined);
    } catch (error: any) {
      toast({
        title: "Failed to create user",
        description: error?.message || "Please check the form and try again.",
        variant: "destructive",
      });
    }
  };

  // Filtering
  const filteredUsers = (() => {
    let out = users;
    if (roleFilter !== "all") out = out.filter((u: any) => u.role === roleFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      out = out.filter(
        (u: any) =>
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
      );
    }
    return out;
  })();

  const getUserInitials = (u: any) =>
    `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase();

  const stats = (() => {
    const totalUsers = users.length;
    const activeUsers = users.filter((u: any) => u.isActive).length;
    const recentUsers = users.filter((u: any) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(u.createdAt) > weekAgo;
    }).length;
    return { totalUsers, activeUsers, recentUsers };
  })();

  if (!canManageUsers) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
            <p className="text-gray-600">
              You don't have permission to manage users. Contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
              <UsersIcon className="w-8 h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-success-600">{stats.activeUsers}</p>
              </div>
              <UserCheck className="w-8 h-8 text-success-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Invites</p>
                <p className="text-2xl font-bold text-warning-600">0</p>
              </div>
              <Watch className="w-8 h-8 text-warning-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">New This Week</p>
                <p className="text-2xl font-bold text-primary-600">{stats.recentUsers}</p>
              </div>
              <UserPlus className="w-8 h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
              <Button variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Send Invites
              </Button>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import
              </Button>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="master_admin">Master Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="store_manager">Store Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Avatar className="h-10 w-10 mr-4">
                            <AvatarFallback>{getUserInitials(u)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {u.firstName} {u.lastName}
                            </div>
                            {u.email && <div className="text-sm text-gray-500">{u.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={roleColors[u.role]}>{roleDisplayNames[u.role]}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div
                            className={`w-2 h-2 rounded-full mr-2 ${
                              u.isActive ? "bg-success-500" : "bg-gray-400"
                            }`}
                          />
                          <span className={`text-sm ${u.isActive ? "text-success-600" : "text-gray-500"}`}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button variant="ghost" size="sm">Edit</Button>
                        {(u.role === "store_manager" || u.role === "employee") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resetPinMutation.mutate(u.id)}
                            disabled={resetPinMutation.isPending}
                          >
                            <Key className="w-4 h-4 mr-1" />
                            Reset PIN
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          Disable
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <UsersIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || roleFilter !== "all" ? "No users found" : "No users yet"}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || roleFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first team member"}
              </p>
              {!searchTerm && roleFilter === "all" && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First User
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            form.reset({
              email: "",
              firstName: "",
              lastName: "",
              role: "employee",
              storeId: user?.storeId,
              password: "",
            });
            setSetPinManually(false);
            setManualPin("");
            setSelectedStoreId(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md" aria-describedby="add-user-desc">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription id="add-user-desc">
              Create an employee, store manager, or admin.
            </DialogDescription>
          </DialogHeader>

          {/* form kept only for layout; we don't rely on native submit */}
          <form id="create-user-form" noValidate onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" {...form.register("firstName")} className="mt-1" placeholder="John" />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" {...form.register("lastName")} className="mt-1" placeholder="Doe" />
                {form.formState.errors.lastName && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <Select
                value={form.watch("role")}
                onValueChange={(v: any) => {
                  form.setValue("role", v, { shouldDirty: true, shouldValidate: false });
                  if (v !== "admin" && v !== "master_admin") form.clearErrors("password");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {user?.role === "master_admin" && <SelectItem value="admin">Admin</SelectItem>}
                  <SelectItem value="store_manager">Store Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="email">Email (Optional for employees)</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                className="mt-1"
                placeholder="john.doe@restaurant.com"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>

            {(form.watch("role") === "master_admin" || form.watch("role") === "admin") && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                  className="mt-1"
                  placeholder="Minimum 6 characters"
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.password.message}</p>
                )}
              </div>
            )}

            {(form.watch("role") === "store_manager" || form.watch("role") === "employee") && !user?.storeId && (
              <div>
                <Label>Store</Label>
                <Select
                  value={selectedStoreId ? String(selectedStoreId) : ""}
                  onValueChange={(v) => setSelectedStoreId(Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} (#{s.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Required for employees and store managers.
                </p>
              </div>
            )}

            {(form.watch("role") === "store_manager" || form.watch("role") === "employee") && (
              <div className="rounded-lg border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={setPinManually}
                    onChange={(e) => setSetPinManually(e.target.checked)}
                  />
                  Set 4-digit PIN manually
                </label>

                {setPinManually ? (
                  <div>
                    <Label>4-digit PIN</Label>
                    <Input
                      value={manualPin}
                      onChange={(e) => setManualPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="e.g. 1234"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A 4-digit PIN will be generated automatically if you don’t set one here.
                  </p>
                )}
              </div>
            )}

            <div className="flex space-x-3">
              {/* key change: explicit click handler; no native submit */}
              <Button
                type="button"
                onClick={submitForm}
                disabled={createUserMutation.isPending}
                className="flex-1"
              >
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
