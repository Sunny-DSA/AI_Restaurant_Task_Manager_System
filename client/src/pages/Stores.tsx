import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { storeApi } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AddStoreDialog from "@/components/AddStoreDialog";
import {
  QrCode,
  MapPin,
  Phone,
  Settings,
  Plus,
  Download,
  RefreshCw,
  Printer,
} from "lucide-react";

/* ---------- schemas (form uses strings) ---------- */
const detailsSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().optional().nullable(),
  timezone: z.string().min(1, "Timezone is required"),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  geofenceRadius: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (!Number.isNaN(Number(v)) &&
          Number(v) >= 10 &&
          Number(v) <= 100000),
      { message: "Enter a number between 10 and 100000" }
    )
    .optional()
    .nullable(),
});
type DetailsForm = z.infer<typeof detailsSchema>;

export default function Stores() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canCreateStores = hasPermission(user?.role || "", "create", "stores");
  const canUpdateStores = hasPermission(user?.role || "", "update", "stores");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any>(null);

  // All stores for admins; otherwise just the user’s store
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: storeApi.getStores,
  });

  const userStoreQueryEnabled = !!user?.storeId && !canCreateStores;
  const { data: currentStore } = useQuery({
    queryKey: ["/api/stores", user?.storeId],
    queryFn: () => storeApi.getStore(user!.storeId!),
    enabled: userStoreQueryEnabled,
  });

  const displayStores = useMemo(
    () => (canCreateStores ? stores : currentStore ? [currentStore] : []),
    [canCreateStores, stores, currentStore]
  );

  const activeStore =
    selectedStore || (displayStores.length === 1 ? displayStores[0] : null);

  // Stats for the card selected in the grid
  const { data: storeStats } = useQuery({
    queryKey: ["/api/stores", activeStore?.id, "stats"],
    queryFn: () => storeApi.getStoreStats(activeStore!.id),
    enabled: !!activeStore?.id,
  });

  /* ---------- edit form ---------- */
  const form = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      timezone: "UTC",
      latitude: "",
      longitude: "",
      geofenceRadius: "500", // string for inputs
    },
  });

  // Load selected store into form (coerce everything to strings)
  useEffect(() => {
    if (!activeStore) return;
    form.reset({
      name: activeStore.name || "",
      address: activeStore.address || "",
      phone: activeStore.phone ?? "",
      timezone: activeStore.timezone || "UTC",
      latitude:
        activeStore.latitude === null || activeStore.latitude === undefined
          ? ""
          : String(activeStore.latitude),
      longitude:
        activeStore.longitude === null || activeStore.longitude === undefined
          ? ""
          : String(activeStore.longitude),
      geofenceRadius: String(activeStore.geofenceRadius ?? 500),
    });

  }, [activeStore, form]);

  /* ---------- mutations ---------- */

  const updateStoreMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DetailsForm> }) =>
      storeApi.updateStore(id, {
        name: data.name?.trim(),
        address: data.address?.trim(),
        phone: (data.phone ?? "") === "" ? null : data.phone?.trim(),
        timezone: data.timezone?.trim(),
        geofenceRadius:
          data.geofenceRadius && data.geofenceRadius !== ""
            ? Number(data.geofenceRadius)
            : undefined,
        // 👇 send strings to satisfy Store type (latitude?: string | null)
        latitude:
          data.latitude && data.latitude !== ""
            ? String(Number(data.latitude))
            : undefined,
        longitude:
          data.longitude && data.longitude !== ""
            ? String(Number(data.longitude))
            : undefined,
      }),
    onSuccess: async () => {
      toast({ title: "Store updated successfully" });
      await qc.invalidateQueries({ queryKey: ["/api/stores"] });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to update store",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const generateQRMutation = useMutation({
    mutationFn: storeApi.generateQR,
    onSuccess: async () => {
      toast({ title: "QR code regenerated" });
      await qc.invalidateQueries({ queryKey: ["/api/stores"] });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to generate QR",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  /* ---------- handlers ---------- */

  const handleDownloadQR = (storeId: number) => {
    const link = document.createElement("a");
    link.href = `/api/stores/${storeId}/qr-pdf`;
    link.download = `store-${storeId}-qr.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onSave = form.handleSubmit((values) => {
    if (!activeStore) return;
    updateStoreMutation.mutate({ id: activeStore.id, data: values });
  });

  /* ---------- render ---------- */
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stores</h2>
        {canCreateStores && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Store
          </Button>
        )}
      </div>

      {/* Grid of stores */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayStores.map((s) => (
          <Card
            key={s.id}
            className={`cursor-pointer transition-all ${
              activeStore?.id === s.id ? "ring-2 ring-primary" : "hover:shadow-md"
            }`}
            onClick={() => setSelectedStore(s)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">{s.name}</h3>
                <Badge variant={s.isActive ? "default" : "secondary"}>
                  {s.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span className="truncate">{s.address}</span>
                </div>
                {s.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-2" />
                    <span>{s.phone}</span>
                  </div>
                )}
              </div>

              {storeStats && activeStore?.id === s.id && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Staff Online</span>
                    <span className="font-medium text-gray-900">
                      {storeStats.checkedInUsers}/{storeStats.totalUsers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tasks Completion</span>
                    <span className="font-medium text-emerald-700">
                      {Math.round(storeStats.completionRate)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Last Updated</span>
                    <span className="font-medium text-gray-900">
                      {new Date(s.updatedAt).toLocaleString()}
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
                    setSelectedStore(s);
                  }}
                >
                  Manage Store
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadQR(s.id);
                  }}
                >
                  <QrCode className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Store card */}
        {canCreateStores && (
          <Card
            className="border-dashed border-2 hover:border-primary-300 transition-colors cursor-pointer"
            onClick={() => setShowCreate(true)}
          >
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Add New Store</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Create a new location with QR check-in.
              </p>
              <Button onClick={() => setShowCreate(true)}>Create Store</Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Details panel for selected store */}
      {activeStore && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{activeStore.name}</CardTitle>
                <p className="text-muted-foreground">{activeStore.address}</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  onClick={() => generateQRMutation.mutate(activeStore.id)}
                  disabled={generateQRMutation.isPending}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${
                      generateQRMutation.isPending ? "animate-spin" : ""
                    }`}
                  />
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
            <form onSubmit={onSave}>
              <div className="grid md:grid-cols-3 gap-8">
                {/* Store Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Store Information</h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Store Name</Label>
                      <Input
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("name")}
                      />
                      {form.formState.errors.name && (
                        <p className="text-sm text-destructive mt-1">
                          {form.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Address</Label>
                      <Textarea
                        rows={3}
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("address")}
                      />
                      {form.formState.errors.address && (
                        <p className="text-sm text-destructive mt-1">
                          {form.formState.errors.address.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("phone")}
                      />
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <Input
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("timezone")}
                      />
                    </div>
                  </div>
                </div>

                {/* Geofence Settings */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Geofence Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Radius (meters)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("geofenceRadius")}
                      />
                    </div>
                    <div>
                      <Label>Latitude</Label>
                      <Input
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("latitude")}
                      />
                    </div>
                    <div>
                      <Label>Longitude</Label>
                      <Input
                        className="mt-1"
                        disabled={!canUpdateStores}
                        {...form.register("longitude")}
                      />
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <MapPin className="w-4 h-4 inline mr-2" />
                        Employees must be within this radius to check in and
                        complete tasks.
                      </p>
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">QR Code</h3>
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
                    <p className="text-sm text-muted-foreground mb-4">
                      Last generated:{" "}
                      {activeStore.updatedAt
                        ? new Date(activeStore.updatedAt).toLocaleString()
                        : "Never"}
                    </p>
                    <div className="space-y-2">
                      <Button
                        onClick={() => generateQRMutation.mutate(activeStore.id)}
                        disabled={generateQRMutation.isPending}
                        className="w-full"
                      >
                        <RefreshCw
                          className={`w-4 h-4 mr-2 ${
                            generateQRMutation.isPending ? "animate-spin" : ""
                          }`}
                        />
                        {generateQRMutation.isPending
                          ? "Generating..."
                          : "Regenerate"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadQR(activeStore.id)}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => window.print()}
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Print
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {canUpdateStores && (
                <div className="mt-8 flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!activeStore) return;
                      form.reset({
                        name: activeStore.name || "",
                        address: activeStore.address || "",
                        phone: activeStore.phone ?? "",
                        timezone: activeStore.timezone || "UTC",
                        latitude:
                          activeStore.latitude === null || activeStore.latitude === undefined
                            ? ""
                            : String(activeStore.latitude),   // <-- string
                        longitude:
                          activeStore.longitude === null || activeStore.longitude === undefined
                            ? ""
                            : String(activeStore.longitude),  // <-- string
                        geofenceRadius: String(activeStore.geofenceRadius ?? 500), // <-- string
                      });
                    }}

                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateStoreMutation.isPending}>
                    {updateStoreMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Create Store Dialog */}
      <AddStoreDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(s) => setSelectedStore(s)}
      />
    </div>
  );
}
