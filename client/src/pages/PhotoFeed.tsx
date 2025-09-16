import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import PhotoFeedItem from "@/components/PhotoFeedItem";

export default function PhotoFeed() {
  const { data: feed = [], isLoading, error } = useQuery({
    queryKey: ["/api/admin/photo-feed"],
    queryFn: () => adminApi.photoFeed({ limit: 50 }),
    refetchInterval: 15000, // auto-refresh every 15s
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Recent Photo Uploads</h1>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          {(error as Error)?.message || "Failed to load photo feed"}
        </div>
      )}

      <div className="space-y-3">
        {feed.map((it) => (
          <PhotoFeedItem key={it.id} item={it} />
        ))}
        {!isLoading && feed.length === 0 && (
          <div className="text-sm text-muted-foreground">No uploads yet.</div>
        )}
      </div>
    </div>
  );
}
