// client/src/components/MiniMap.tsx
// A dependency-free SVG mini map that shows store geofence and photo GPS.

type Center = { lat: number; lng: number };
type GPS = { latitude: number; longitude: number };

export default function MiniMap({
  center,
  gps,
  radiusM,
  size = 180,
}: {
  center?: Center | null;
  gps?: GPS | null;
  radiusM?: number | null;
  size?: number;
}) {
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h / 2;

  if (!center || radiusM == null) {
    return (
      <div className="w-full h-full grid place-items-center text-xs text-muted-foreground bg-muted rounded">
        No geofence data
      </div>
    );
  }

  // meters per degree approximations
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos((center.lat * Math.PI) / 180);

  // world radius we want to display (slightly larger than geofence)
  const worldRadiusM = radiusM * 1.8;
  const padding = 10; // px
  const pxPerMeter = (Math.min(w, h) / 2 - padding) / worldRadiusM;

  // geofence circle (center at canvas center)
  const geofencePx = radiusM * pxPerMeter;

  // place GPS (if present)
  let gpsX = cx;
  let gpsY = cy;
  if (gps) {
    const dLat = (gps.latitude - center.lat) * mPerDegLat; // meters north(+)/south(-)
    const dLng = (gps.longitude - center.lng) * mPerDegLng; // meters east(+)/west(-)
    gpsX = cx + dLng * pxPerMeter;
    gpsY = cy - dLat * pxPerMeter;
  }

  return (
    <svg width={w} height={h} className="rounded bg-muted">
      {/* geofence outline */}
      <circle cx={cx} cy={cy} r={geofencePx} fill="none" stroke="currentColor" opacity={0.2} />
      {/* store center */}
      <circle cx={cx} cy={cy} r={3} fill="currentColor" opacity={0.8} />
      {/* gps point */}
      {gps && <circle cx={gpsX} cy={gpsY} r={4} fill="currentColor" />}
      {/* line from center to gps */}
      {gps && (
        <line x1={cx} y1={cy} x2={gpsX} y2={gpsY} stroke="currentColor" opacity={0.5} />
      )}
    </svg>
  );
}
