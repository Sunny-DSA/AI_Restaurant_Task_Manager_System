import { useEffect, useState } from "react";

type Row = {
  photoId: number;
  uploadedAt: string;
  filename: string;
  mimeType: string;
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
  url?: string | null;       // data URL returned by API
  taskId?: number | null;
  listName?: string | null;
  storeId?: number | null;
};

export default function PhotoFeed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/task-previews", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j?.message || r.statusText))))
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Recent Photo Uploads</h1>
      {err && <div className="text-red-600 mb-4">{err}</div>}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.photoId} className="border rounded-lg p-3">
            {r.url ? (
              <img src={r.url} alt={r.filename} className="w-full h-48 object-cover rounded" />
            ) : (
              <div className="w-full h-48 bg-gray-100 flex items-center justify-center rounded">No preview</div>
            )}
            <div className="mt-3 text-sm">
              <div className="font-medium">{r.filename}</div>
              <div className="text-gray-600">{new Date(r.uploadedAt).toLocaleString()}</div>
              <div className="text-gray-600">{r.uploadedByName ?? "Unknown"} ({r.uploadedByRole ?? "user"})</div>
              {r.listName && <div className="text-gray-600">List: {r.listName}</div>}
              {r.taskId && <div className="text-gray-600">Task #{r.taskId}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
