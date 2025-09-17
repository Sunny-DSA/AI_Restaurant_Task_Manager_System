// client/src/pages/PhotoFeed.tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, storeApi, userApi, type AdminPhotoFeedItem } from "@/lib/api";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import PhotoFeedItem from "@/components/PhotoFeedItem";
import PhotoPreviewDialog from "@/components/PhotoPreviewDialog";
import { Input } from "@/components/ui/input";

export default function PhotoFeedPage() {
  // filters
  const [storeFilter, setStoreFilter] = useState<string>("all"); // "all" | "<storeId>"
  const [userFilter, setUserFilter] = useState<string>("all");   // "all" | "<userId>"
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>("");

  const selectedStoreId = useMemo(() => {
    if (storeFilter === "all") return undefined;
    const n = Number(storeFilter);
    return Number.isFinite(n) ? n : undefined;
  }, [storeFilter]);

  const selectedUserId = useMemo(() => {
    if (userFilter === "all") return undefined;
    const n = Number(userFilter);
    return Number.isFinite(n) ? n : undefined;
  }, [userFilter]);

  // stores
  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    queryFn: storeApi.getStores,
  });

  // employees (filtered by store if selected)
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users", selectedStoreId ?? "all"],
    queryFn: () => userApi.getUsers(selectedStoreId),
  });

  // feed
  const { data: feed = [] } = useQuery({
    queryKey: [
      "/api/admin/photo-feed",
      selectedStoreId ?? "all",
      selectedUserId ?? "all",
      fromDate || "",
      toDate || "",
      sort,
    ],
    queryFn: () =>
      adminApi.photoFeed({
        storeId: selectedStoreId,
        userId: selectedUserId,
        limit: 120,
        sort,
        dateFrom: fromDate || undefined,
        dateTo: toDate || undefined,
      }),
    staleTime: 15_000,
  });

  // lightbox
  const [preview, setPreview] = useState<AdminPhotoFeedItem | null>(null);

  return (
    <div className="p-4 space-y-4">
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-4">
          {/* Store */}
          <div>
            <Label className="text-xs">Store</Label>
            <Select value={storeFilter} onValueChange={(v) => { setStoreFilter(v); setUserFilter("all"); }}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stores</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employee */}
          <div>
            <Label className="text-xs">Employee</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {(u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : u.email || `User #${u.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div>
            <Label className="text-xs">From</Label>
            <div className="flex gap-2 mt-1">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  className="text-xs text-muted-foreground hover:underline"
                  title="Clear dates"
                >
                  Clear
                </button>
              )}
            </div>
          </div>


          {/* Date to + sort */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">To</Label>
              <Input
                className="mt-1"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Sort</Label>
              <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "oldest")}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Sort order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {feed.length === 0 && (
          <div className="text-sm text-muted-foreground">No uploads found for current filters.</div>
        )}
        {feed.map((it: AdminPhotoFeedItem) => (
          <PhotoFeedItem key={it.id} item={it} onClick={setPreview} />
        ))}
      </div>

      <PhotoPreviewDialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} item={preview} />
    </div>
  );
}
