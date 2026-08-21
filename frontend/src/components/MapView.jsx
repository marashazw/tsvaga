import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, ZoomControl, useMapEvents } from 'react-leaflet';
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

// A "you are here" style marker matching a dark badge with a person icon,
// floating above the actual point via a thin stem, with a blue GPS dot at
// the real location - instead of Leaflet's generic default pin.
const personSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="white">
  <circle cx="12" cy="7" r="4"/>
  <path d="M12 13c-4.418 0-8 2.239-8 5v2h16v-2c0-2.761-3.582-5-8-5z"/>
</svg>`;
const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div class="user-location-badge">${personSvg}</div><div class="user-location-stem"></div><div class="user-location-dot"></div>`,
  iconSize: [40, 58],
  iconAnchor: [20, 51],
  popupAnchor: [0, -52],
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
        zoomControl={false}
        style={{ height: '420px', width: '100%', borderRadius: '12px' }}
      >
        <ZoomControl position="bottomright" />
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
