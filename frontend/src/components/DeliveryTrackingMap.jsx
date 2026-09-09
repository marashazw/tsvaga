import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ZIMBABWE_CENTER } from '../api';

// A moving delivery marker - a filled circle with a small directional
// truck glyph, distinct from the "you are here" person marker used
// elsewhere, so it's clearly a different kind of point on the map.
const vendorSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
  <path d="M3 6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3h2.28a1 1 0 0 1 .9.56l1.72 3.44H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.17a2.5 2.5 0 0 1-4.66 0H8.83a2.5 2.5 0 0 1-4.66 0H3a1 1 0 0 1-1-1V6zm14 5h1.66l-1-2H17v2zM6.5 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm11 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
</svg>`;
const vendorIcon = L.divIcon({
  className: 'delivery-vendor-marker',
  html: `<div class="delivery-vendor-badge">${vendorSvg}</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const destinationIcon = L.divIcon({
  className: 'delivery-destination-marker',
  html: `<div class="delivery-destination-dot"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Keeps the map fitted to show both the vendor and the destination
// whenever either point changes, without fighting the person if they've
// manually panned/zoomed - only refits on an actual position change.
function AutoFitBounds({ vendorPos, destPos }) {
  const map = useMap();
  const lastFit = useRef(null);

  useEffect(() => {
    if (!vendorPos) return;
    const key = `${vendorPos.lat},${vendorPos.lng}`;
    if (lastFit.current === key) return;
    lastFit.current = key;

    const points = [[vendorPos.lat, vendorPos.lng]];
    if (destPos) points.push([destPos.lat, destPos.lng]);

    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView(points[0], 15);
    }
  }, [vendorPos, destPos, map]);

  return null;
}

// vendorPos updates live as new positions arrive (passed in from the
// parent, which listens on the socket) - destPos is fixed for the whole
// delivery.
export default function DeliveryTrackingMap({ vendorPos, destPos, vendorLabel }) {
  const [hasFirstFix, setHasFirstFix] = useState(false);

  useEffect(() => {
    if (vendorPos) setHasFirstFix(true);
  }, [vendorPos]);

  const center = vendorPos || destPos || ZIMBABWE_CENTER;

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={vendorPos ? 15 : 6}
        zoomControl={false}
        style={{ height: '360px', width: '100%', borderRadius: '12px' }}
      >
        <ZoomControl position="bottomright" />
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AutoFitBounds vendorPos={vendorPos} destPos={destPos} />
        {destPos && (
          <Marker position={[destPos.lat, destPos.lng]} icon={destinationIcon}>
            <Tooltip direction="top" offset={[0, -10]} permanent>
              Delivery location
            </Tooltip>
          </Marker>
        )}
        {vendorPos && (
          <Marker position={[vendorPos.lat, vendorPos.lng]} icon={vendorIcon}>
            <Tooltip direction="top" offset={[0, -18]}>
              {vendorLabel || 'Vendor'}
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
      {!hasFirstFix && (
        <p className="hint" style={{ textAlign: 'center', marginTop: 6 }}>
          Waiting for the vendor's live location…
        </p>
      )}
    </div>
  );
}
