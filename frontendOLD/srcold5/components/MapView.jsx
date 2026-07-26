import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { ZIMBABWE_CENTER } from '../api';

// Lets the requester tap/click the map to drop their location pin.
function ClickToSetLocation({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapView({ requesterLocation, onPickLocation, radiusKm, vendors = [] }) {
  const center = requesterLocation || ZIMBABWE_CENTER;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={requesterLocation ? 13 : 6}
      style={{ height: '420px', width: '100%', borderRadius: '12px' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ClickToSetLocation onPick={onPickLocation} />

      {requesterLocation && (
        <>
          <Marker position={[requesterLocation.lat, requesterLocation.lng]}>
            <Popup>Your request location</Popup>
          </Marker>
          <Circle
            center={[requesterLocation.lat, requesterLocation.lng]}
            radius={(radiusKm || 5) * 1000}
            pathOptions={{ color: '#2f6f4f', fillOpacity: 0.06 }}
          />
        </>
      )}

      {vendors.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lng]}>
          <Popup>
            <strong>{v.business_name}</strong>
            <br />
            {v.address_text}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
