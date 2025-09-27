import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { storeApi } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Store name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().default("UTC"),
  geofenceRadius: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().positive().optional()
  ),
  latitude: z
    .preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite())
    .optional(),
  longitude: z
    .preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite())
    .optional(),
});
type FormData = z.infer<typeof schema>;

export default function AddStoreDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (store: any) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      timezone: "UTC",
      geofenceRadius: 500,
      latitude: undefined,
      longitude: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: storeApi.createStore,
    onSuccess: async (store) => {
      toast({ title: "Store created", description: store.name });
      await qc.invalidateQueries({ queryKey: ["/api/stores"] });
      onCreated?.(store);
      onClose();
      form.reset();
    },
    onError: (e: any) =>
      toast({
        title: "Failed to create store",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const submit = form.handleSubmit(async (data) => {
    setSubmitting(true);
    try {
      // If latitude/longitude are omitted, backend will geocode by address.
      await createMutation.mutateAsync({
        name: data.name.trim(),
        address: data.address?.trim() || "",
        phone: data.phone?.trim() || null,
        timezone: data.timezone || "UTC",
        geofenceRadius: data.geofenceRadius,
        latitude: data.latitude as any,
        longitude: data.longitude as any,
        isActive: true,
      });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Store</DialogTitle>
          <DialogDescription>
            Enter the store details. If you omit latitude/longitude, we’ll geocode the address for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Store Name</Label>
            <Input placeholder="Downtown Location" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label>Address</Label>
            <Textarea rows={3} placeholder="123 Main St, City, ST 00000" {...form.register("address")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Phone (optional)</Label>
              <Input placeholder="(555) 123-4567" {...form.register("phone")} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input placeholder="America/Chicago or UTC" {...form.register("timezone")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Radius (m)</Label>
              <Input type="number" min={10} {...form.register("geofenceRadius")} placeholder="500" />
            </div>
            <div>
              <Label>Latitude (optional)</Label>
              <Input type="number" step="any" {...form.register("latitude")} />
            </div>
            <div>
              <Label>Longitude (optional)</Label>
              <Input type="number" step="any" {...form.register("longitude")} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Store"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
