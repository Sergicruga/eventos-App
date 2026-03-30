/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Filter events by distance from user location
 */
export function filterEventsByRadius(events = [], userCoords, radiusKm = 25) {
  if (!userCoords || !userCoords.latitude || !userCoords.longitude) {
    return events; // Return all if no user location
  }

  return events
    .map((event) => {
      // Only calculate distance if event has coordinates
      if (event.latitude != null && event.longitude != null) {
        const distance = calculateDistance(
          userCoords.latitude,
          userCoords.longitude,
          event.latitude,
          event.longitude
        );
        return {
          ...event,
          distance,
          withinRadius: distance <= radiusKm,
        };
      }
      // Events without coordinates are excluded from location filtering
      return {
        ...event,
        distance: null,
        withinRadius: false,
      };
    })
    .filter((event) => event.withinRadius)
    .sort((a, b) => {
      // Events with distance first (sorted by distance), then events without distance
      if (a.distance !== null && b.distance !== null) {
        return a.distance - b.distance;
      }
      if (a.distance === null && b.distance !== null) return 1;
      if (a.distance !== null && b.distance === null) return -1;
      return 0;
    });
}
