import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { storeApi } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Store, 
  QrCode, 
  MapPin, 
  Phone, 
  Users, 
  TrendingUp, 
  Settings, 
  Plus,
  Download,
  RefreshCw,
  Printer
} from "lucide-react";

const storeSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().optional(),
  timezone: z.string().default("UTC"),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  geofenceRadius: z.number().min(10).max(1000).default(100),
});

type StoreFormData = z.infer<typeof storeSchema>;

export default function Stores() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any>(null);

  const canCreateStores = hasPermission(user?.role || "", "create", "stores");
  const canUpdateStores = hasPermission(user?.role || "", "update", "stores");

  // Get stores
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: storeApi.getStores,
    enabled: canCreateStores, // Only master admins can see all stores
  });

  // Get current user's store if they're a store manager
  const { data: currentStore } = useQuery({
    queryKey: ["/api/stores", user?.storeId],
    queryFn: () => storeApi.getStore(user!.storeId!),
    enabled: !!user?.storeId && !canCreateStores,
  });

  // Get store stats
  const { data: storeStats } = useQuery({
    queryKey: ["/api/stores", selectedStore?.id || user?.storeId, "stats"],
    queryFn: () => storeApi.getStoreStats(selectedStore?.id || user?.storeId!),
    enabled: !!(selectedStore?.id || user?.storeId),
  });

  const displayStores = canCreateStores ? stores : (currentStore ? [currentStore] : []);
  const activeStore = selectedStore || (displayStores.length === 1 ? displayStores[0] : null);

  const form = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      timezone: "UTC",
      latitude: "",
      longitude: "",
      geofenceRadius: 100,
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: storeApi.createStore,
    onSuccess: () => {
      toast({
        title: "Store created successfully",
        description: "New store has been added and QR code generated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      setShowCreateModal(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create store",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStoreMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<StoreFormData>) =>
      storeApi.updateStore(id, data),
    onSuccess: () => {
      toast({
        title: "Store updated successfully",
        description: "Store information has been saved",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update store",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateQRMutation = useMutation({
    mutationFn: storeApi.generateQR,
    onSuccess: () => {
      toast({
        title: "QR code regenerated",
        description: "New QR code has been generated for this store",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate QR code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StoreFormData) => {
    createStoreMutation.mutate(data);
  };

  const handleDownloadQR = (storeId: number) => {
    const link = document.createElement("a");
    link.href = `/api/stores/${storeId}/qr-pdf`;
    link.download = `store-${storeId}-qr.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Store Overview Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayStores.map((store) => (
          <Card 
            key={store.id} 
            className={`cursor-pointer transition-all ${
              activeStore?.id === store.id ? "ring-2 ring-primary" : "hover:shadow-md"
            }`}
            onClick={() => setSelectedStore(store)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{store.name}</h3>
                <Badge variant={store.isActive ? "default" : "secondary"}>
                  {store.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span className="truncate">{store.address}</span>
                </div>
                {store.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-2" />
                    <span>{store.phone}</span>
                  </div>
                )}
              </div>

              {storeStats && activeStore?.id === store.id && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Staff Online</span>
                    <span className="font-medium text-gray-900">
                      {storeStats.checkedInUsers}/{storeStats.totalUsers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tasks Completion</span>
                    <span className="font-medium text-success-600">
                      {Math.round(storeStats.completionRate)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Last Updated</span>
                    <span className="font-medium text-gray-900">
                      {new Date(store.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStore(store);
                  }}
                >
                  Manage Store
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadQR(store.id);
                  }}
                >
                  <QrCode className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Store Card */}
        {canCreateStores && (
          <Card 
            className="border-dashed border-2 hover:border-primary-300 transition-colors cursor-pointer"
            onClick={() => setShowCreateModal(true)}
          >
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Add New Store</h3>
              <p className="text-gray-600 text-sm mb-6">
                Create a new restaurant location with QR codes and staff management
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                Create Store
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Store Details Panel */}
      {activeStore && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{activeStore.name}</CardTitle>
                <p className="text-gray-600">{activeStore.address}</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  onClick={() => generateQRMutation.mutate(activeStore.id)}
                  disabled={generateQRMutation.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${generateQRMutation.isPending ? "animate-spin" : ""}`} />
                  {generateQRMutation.isPending ? "Generating..." : "Generate QR"}
                </Button>
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Store Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Store Information</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Store Name</Label>
                    <Input 
                      defaultValue={activeStore.name}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Address</Label>
                    <Textarea
                      defaultValue={activeStore.address}
                      className="mt-1"
                      rows={3}
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Phone</Label>
                    <Input
                      defaultValue={activeStore.phone || ""}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Timezone</Label>
                    <Input
                      defaultValue={activeStore.timezone}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                </div>
              </div>

              {/* Geofence Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Geofence Settings</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Radius (meters)</Label>
                    <Input
                      type="number"
                      defaultValue={activeStore.geofenceRadius}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Latitude</Label>
                    <Input
                      defaultValue={activeStore.latitude || ""}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Longitude</Label>
                    <Input
                      defaultValue={activeStore.longitude || ""}
                      className="mt-1"
                      disabled={!canUpdateStores}
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <MapPin className="w-4 h-4 inline mr-2" />
                      Employees must be within this radius to check in and complete tasks.
                    </p>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">QR Code</h3>
                <div className="text-center">
                  <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    {activeStore.qrCode ? (
                      <img
                        src={activeStore.qrCode}
                        alt="Store QR Code"
                        className="w-full h-full object-contain rounded-lg"
                      />
                    ) : (
                      <QrCode className="w-16 h-16 text-gray-400" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Last generated: {activeStore.updatedAt ? new Date(activeStore.updatedAt).toLocaleString() : "Never"}
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={() => generateQRMutation.mutate(activeStore.id)}
                      disabled={generateQRMutation.isPending}
                      className="w-full"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${generateQRMutation.isPending ? "animate-spin" : ""}`} />
                      {generateQRMutation.isPending ? "Generating..." : "Regenerate"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDownloadQR(activeStore.id)}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Printer className="w-4 h-4 mr-2" />
                      Print
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {canUpdateStores && (
              <div className="mt-8 flex justify-end space-x-3">
                <Button variant="outline">Cancel</Button>
                <Button
                  onClick={() => {
                    // Implementation for saving changes would go here
                    toast({
                      title: "Feature coming soon",
                      description: "Store editing will be available in the next update",
                    });
                  }}
                >
                  Save Changes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Store Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Store</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="name">Store Name</Label>
              <Input
                id="name"
                {...form.register("name")}
                className="mt-1"
                placeholder="Downtown Location"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                {...form.register("address")}
                className="mt-1"
                rows={3}
                placeholder="123 Main Street, City, State 12345"
              />
              {form.formState.errors.address && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.address.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone (Optional)</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                className="mt-1"
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="flex space-x-3">
              <Button
                type="submit"
                disabled={createStoreMutation.isPending}
                className="flex-1"
              >
                {createStoreMutation.isPending ? "Creating..." : "Create Store"}
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
