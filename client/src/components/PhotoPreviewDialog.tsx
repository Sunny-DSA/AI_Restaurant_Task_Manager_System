// client/src/components/PhotoPreviewDialog.tsx
import { AdminPhotoFeedItem } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import MiniMap from "@/components/MiniMap";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: AdminPhotoFeedItem | null;
};

const qualityStyle: Record<AdminPhotoFeedItem["quality"], string> = {
  inside: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  near: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  outside: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function PhotoPreviewDialog({ open, onOpenChange, item }: Props) {
  if (!item) return null;
  const ts = new Date(item.uploadedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Photo Preview
            <Badge className={qualityStyle[item.quality]}>{item.quality.toUpperCase()}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
          {/* Large image */}
          <div className="rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            <img
              src={item.photoUrl}
              alt="upload large"
              className="max-h-[70vh] w-full object-contain"
            />
          </div>

          {/* Details */}
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-muted-foreground">Uploaded</div>
              <div className="font-medium">{ts.toLocaleString()}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Uploaded by</div>
              <div className="font-medium">
                {item.uploadedByName || "Unknown"}
                {item.uploadedByRole ? ` (${item.uploadedByRole})` : ""}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Store</div>
              <div className="font-medium">{item.store?.name || "—"}</div>
              <div className="text-xs text-muted-foreground">
                Radius: {item.store?.radiusM ?? "—"} m
              </div>
            </div>

            <div>
              <div className="text-muted-foreground">Task</div>
              <div className="font-medium">
                {item.task?.listName ? `${item.task.listName} • ` : ""}
                {item.task?.templateTitle || item.task?.title || (item.task ? `Task #${item.task.id}` : "—")}
              </div>
              {item.task?.id ? (
                <div className="text-xs text-muted-foreground">Task ID: {item.task.id}</div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-muted px-2 py-1">
                <span className="text-muted-foreground">GPS: </span>
                <span className="font-medium">
                  {item.gps
                    ? `${item.gps.latitude.toFixed(6)}, ${item.gps.longitude.toFixed(6)}`
                    : "—"}
                </span>
              </div>
              <div className="rounded bg-muted px-2 py-1">
                <span className="text-muted-foreground">Distance: </span>
                <span className="font-medium">
                  {item.distanceM == null ? "—" : `${Math.round(item.distanceM)} m`}
                </span>
              </div>
            </div>

            {/* Mini map */}
            <div>
              <div className="text-muted-foreground mb-1">Geofence</div>
              <div className="rounded-lg overflow-hidden">
                <MiniMap
                  center={item.store?.center || undefined}
                  radiusM={item.store?.radiusM ?? undefined}
                  gps={item.gps || undefined}
                  size={200}
                />
              </div>
            </div>

            <div className="pt-1">
              <a
                href={item.photoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Open image in new tab
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
