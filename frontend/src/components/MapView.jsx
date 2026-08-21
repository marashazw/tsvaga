import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api, ZIMBABWE_CENTER } from '../api';

// Lets the requester tap/click the map to drop their location pin.
function ClickToSetLocation({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// A "you are here" style marker - a blue GPS dot with a small person badge
// above it, instead of Leaflet's generic default pin.
const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div class="user-location-dot"></div><div class="user-location-badge">🧍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});

export default function MapView({ requesterLocation, onPickLocation, radiusKm, vendors = [], onAddressFound }) {
  const center = requesterLocation || ZIMBABWE_CENTER;

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    setMapError(null);
    try {
      const { data } = await api.get('/geocode', { params: { q: searchText } });
      onAddressFound?.({ lat: data.lat, lng: data.lng, label: data.display_name });
      setSearchText('');
    } catch (err) {
      setMapError(err.response?.data?.error || 'Could not find that address');
    } finally {
      setSearching(false);
    }
  }

  function handleLocateMe() {
    if (!navigator.geolocation) {
      setMapError('Your browser does not support GPS location.');
      return;
    }
    setLocating(true);
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPickLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setMapError('Could not get your location - check your device/browser location permissions.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="map-overlay-controls">
        <form onSubmit={handleSearch} className="map-search-bar">
          <input
            type="text"
            placeholder="Type a street address / suburb…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button type="submit" disabled={searching}>
            {searching ? '…' : 'Go'}
          </button>
        </form>
        <button
          type="button"
          className="map-locate-btn"
          onClick={handleLocateMe}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? '…' : '📍'}
        </button>
      </div>
      {mapError && <p className="error map-overlay-error">{mapError}</p>}

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
            <Marker position={[requesterLocation.lat, requesterLocation.lng]} icon={userLocationIcon}>
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
    </div>
  );
}
