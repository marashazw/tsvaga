// Small helper to build a PostGIS geography point literal safely from lng/lat.
function toGeoPoint(lng, lat) {
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error('lng and lat must be numbers');
  }
  return `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

// Zimbabwe's rough bounding box - useful for validating incoming coordinates
// and for centering the map on the frontend.
const ZIMBABWE_BOUNDS = {
  minLat: -22.4,
  maxLat: -15.6,
  minLng: 25.2,
  maxLng: 33.1,
};

function isWithinZimbabwe(lng, lat) {
  return (
    lat >= ZIMBABWE_BOUNDS.minLat &&
    lat <= ZIMBABWE_BOUNDS.maxLat &&
    lng >= ZIMBABWE_BOUNDS.minLng &&
    lng <= ZIMBABWE_BOUNDS.maxLng
  );
}

module.exports = { toGeoPoint, ZIMBABWE_BOUNDS, isWithinZimbabwe };
