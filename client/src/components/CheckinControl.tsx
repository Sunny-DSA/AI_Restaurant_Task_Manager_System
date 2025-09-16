import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapPin, LogOut } from "lucide-react";

/**
 * Small header control for employees/managers to Check in / Check out.
 * - Reads status from GET /api/checkins/me
 * - POST /api/auth/checkin with { storeId, latitude, longitude }
 * - POST /api/auth/checkout
 */
export default function CheckinControl({ storeId }: { storeId?: number }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Only show for employees/managers
  const show =
    !!user && (user.role === "employee" || user.role === "store_manager");
  if (!show) return null;

  const sid = storeId ?? user?.storeId ?? null;

  const status = useQuery({
    queryKey: ["/api/checkins/me"],
    queryFn: async () => {
      const r = await fetch("/api/checkins/me", { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{
        checkedIn: boolean;
        storeId?: number;
        latitude?: number;
        longitude?: number;
        at?: string;
      }>;
    },
    staleTime: 10_000,
  });

  const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!sid) throw new Error("No store assigned to your account.");
      const coords = await getCoords();
      if (coords.latitude == null || coords.longitude == null)
        throw new Error("Location required (enable GPS and try again).");

      const r = await fetch("/api/auth/checkin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: sid, ...coords }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Checked in" });
      status.refetch();
    },
    onError: (e: any) =>
      toast({
        title: "Check-in failed",
        description: String(e?.message || e),
        variant: "destructive",
      }),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/auth/checkout", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Checked out" });
      status.refetch();
    },
  });

  const checked = !!status.data?.checkedIn;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`text-xs px-2 py-1 rounded ${
          checked
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        }`}
      >
        {checked ? "Checked in" : "Not checked in"}
      </div>

      {checked ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => checkOut.mutate()}
          disabled={checkOut.isPending}
          title="Check out"
        >
          <LogOut className="w-4 h-4 mr-1" />
          Out
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => checkIn.mutate()}
          disabled={checkIn.isPending || !sid}
          title={sid ? "Check in" : "No store assigned"}
        >
          <MapPin className="w-4 h-4 mr-1" />
          In
        </Button>
      )}
    </div>
  );
}
