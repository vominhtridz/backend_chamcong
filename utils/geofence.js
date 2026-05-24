/** Tính khoảng cách Haversine (mét) giữa 2 tọa độ GPS */

const toRad = (deg) => (deg * Math.PI) / 180;

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || Number.isNaN(Number(v)))) {
    return null;
  }
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const evaluateGeofence = (lat, lng, settings = {}) => {
  if (!settings.geofenceEnabled) {
    return { inZone: true, distanceMeters: null, skipped: true };
  }

  const centerLat = Number(settings.geofenceLat);
  const centerLng = Number(settings.geofenceLng);
  const radius = Number(settings.geofenceRadiusMeters) || 500;

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { inZone: false, distanceMeters: null, skipped: false, noGps: true };
  }

  const dist = distanceMeters(lat, lng, centerLat, centerLng);
  return {
    inZone: dist != null && dist <= radius,
    distanceMeters: dist != null ? Math.round(dist) : null,
    radiusMeters: radius,
    skipped: false,
  };
};

module.exports = { distanceMeters, evaluateGeofence };
