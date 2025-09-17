// server/utils/geo.ts

// Core function: distance between two lat/lng points (in meters)
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const qa =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(qa)));
}

// Convenience: point-within-radius check
export function withinFence(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusM: number
): boolean {
  return haversineMeters(point, center) <= radiusM;
}

// 🔧 Alias to satisfy admin.ts import:
// Same result as haversineMeters, but with 4 number args.
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
}
