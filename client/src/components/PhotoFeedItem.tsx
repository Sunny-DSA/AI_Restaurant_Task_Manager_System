// client/src/components/PhotoFeedItem.tsx
import { AdminPhotoFeedItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

type Props = { item: AdminPhotoFeedItem; onClick?: (item: AdminPhotoFeedItem) => void };

const fmtMeters = (m: number | null) => {
  if (m == null) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
};

const qualityStyle: Record<AdminPhotoFeedItem["quality"], string> = {
  inside: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  near: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  outside: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function PhotoFeedItem({ item, onClick }: Props) {
  const ts = new Date(item.uploadedAt);
  return (
    <button
      className="w-full text-left rounded-lg border p-3 flex gap-3 hover:shadow-sm transition"
      onClick={() => onClick?.(item)}
    >
      <div className="w-28 h-28 rounded-md overflow-hidden bg-muted shrink-0">
        <img
          src={item.photoUrl}
          alt="upload"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            <div className="text-sm font-medium truncate">
              {item.uploadedByName || "Unknown user"}
              {item.uploadedByRole ? (
                <span className="text-xs text-muted-foreground ml-2">({item.uploadedByRole})</span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {item.store?.name || "—"} • {ts.toLocaleString()}
            </div>
          </div>
          <Badge className={qualityStyle[item.quality]}>
            {item.quality.toUpperCase()}
          </Badge>
        </div>

        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-muted px-2 py-1">
            <span className="text-muted-foreground">Distance: </span>
            <span className="font-medium">{fmtMeters(item.distanceM)}</span>
          </div>
          <div className="rounded bg-muted px-2 py-1">
            <span className="text-muted-foreground">Store radius: </span>
            <span className="font-medium">
              {item.store?.radiusM != null ? `${item.store.radiusM} m` : "—"}
            </span>
          </div>
          <div className="rounded bg-muted px-2 py-1">
            <span className="text-muted-foreground">GPS: </span>
            <span className="font-medium">
              {item.gps ? `${item.gps.latitude.toFixed(5)}, ${item.gps.longitude.toFixed(5)}` : "—"}
            </span>
          </div>
        </div>

        {item.task && (
          <div className="mt-2 text-xs text-muted-foreground truncate">
            {item.task.listName ? `${item.task.listName} • ` : ""}
            {item.task.templateTitle || item.task.title || `Task #${item.task.id}`}
          </div>
        )}
      </div>
    </button>
  );
}
