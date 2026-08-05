'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';

// Helper component to fix map sizing glitches when rendered in dynamic containers
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Custom markers — flat, no glow/shadow
const subIcon = L.divIcon({
  className: 'custom-sub-icon',
  html: '<div style="background-color: #c0392b; width: 16px; height: 16px; border-radius: 3px; border: 2px solid #e8e4d9;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const dtIcon = L.divIcon({
  className: 'custom-dt-icon',
  html: '<div style="background-color: #c4a035; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #e8e4d9;"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

interface MapProps {
  network: any;
  tickets: any[];
  onSelectPole?: (poleId: string) => void;
}

export default function MapView({ network, tickets, onSelectPole }: MapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !network) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-cc-card text-cc-text-mut rounded border border-cc-border">
        Loading Map View...
      </div>
    );
  }

  const center: [number, number] = network.substations && network.substations.length > 0
    ? [network.substations[0].lat, network.substations[0].lon]
    : [12.9716, 77.5946];

  // Map poles by pole_id for drawing lines
  const polesMap = new Map<string, any>();
  if (network.poles) {
    network.poles.forEach((p: any) => polesMap.set(p.pole_id, p));
  }

  // Identify dark / faulted poles from tickets
  const darkPoleIds = new Set<string>();
  const lowConfPoles = new Set<string>();

  tickets.forEach(tkt => {
    if (tkt.status !== 'verified' && tkt.status !== 'closed') {
      (tkt.affected_pole_ids || []).forEach((pid: string) => {
        darkPoleIds.add(pid);
        if (tkt.confidence_level === 'LOW') {
          lowConfPoles.add(pid);
        }
      });
    }
  });

  return (
    <div className="w-full h-full relative rounded overflow-hidden border border-cc-border">
      <MapContainer center={center} zoom={14} scrollWheelZoom={true} className="w-full h-full">
        <MapResizer />
        {/* OpenStreetMap Tile Layer */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Substations */}
        {network.substations?.map((sub: any) => (
          <Marker key={sub.substation_id} position={[sub.lat, sub.lon]} icon={subIcon}>
            <Popup>
              <div className="p-1">
                <h4 className="font-bold text-sm text-cc-text">{sub.name}</h4>
                <p className="text-xs text-cc-text-sec">Substation Code: {sub.code}</p>
                <p className="text-xs text-cc-text-mut">({sub.lat.toFixed(4)}, {sub.lon.toFixed(4)})</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* DTs */}
        {network.transformers?.map((dt: any) => (
          <Marker key={dt.dt_id} position={[dt.lat, dt.lon]} icon={dtIcon}>
            <Popup>
              <div className="p-1">
                <h4 className="font-bold text-sm text-cc-text">Transformer: {dt.dt_id}</h4>
                <p className="text-xs text-cc-text-sec">Capacity: {dt.capacity_kva} kVA</p>
                <p className="text-xs text-cc-text-sec">Households Served: {dt.households_served}</p>
                <p className="text-xs text-cc-text-mut">Feeder: {dt.feeder_id}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Poles */}
        {network.poles?.map((pole: any) => {
          const isDark = darkPoleIds.has(pole.pole_id) || pole.is_energized === false;
          const isLowConf = lowConfPoles.has(pole.pole_id);
          const hasDevice = !!pole.device_id;

          let color = '#27ae60'; // Energized green
          if (!hasDevice) color = '#6b6860'; // No device muted
          if (isDark) color = isLowConf ? '#c4a035' : '#c0392b'; // Gold for low conf, Red for high conf

          return (
            <CircleMarker
              key={pole.pole_id}
              center={[pole.lat, pole.lon]}
              radius={isDark ? 6 : 4}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.9,
                weight: isDark ? 2.5 : 1
              }}
              eventHandlers={{
                click: () => onSelectPole && onSelectPole(pole.pole_id)
              }}
            >
              <Popup>
                <div className="p-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-cc-text">{pole.pole_id}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      isDark
                        ? 'bg-cc-red-bg text-cc-red border border-cc-red/30'
                        : 'bg-cc-green-bg text-cc-green border border-cc-green/30'
                    }`}>
                      {isDark ? 'DARK' : 'LIVE'}
                    </span>
                  </div>
                  <p className="text-xs text-cc-text-sec mt-1">DT: {pole.dt_id} | Feeder: {pole.feeder_id}</p>
                  <p className="text-xs text-cc-text-sec">Topology: {pole.topology_type?.toUpperCase()}</p>
                  {pole.parent_pole_id && <p className="text-xs text-cc-text-mut">Parent: {pole.parent_pole_id}</p>}
                  {pole.inferred_parent_pole_id && !pole.parent_pole_id && <p className="text-xs text-cc-text-mut">Inferred Parent: {pole.inferred_parent_pole_id} (Geometrically Inferred)</p>}
                  <p className="text-xs text-cc-text-mut">Ward: {pole.ward} | PIN: {pole.pincode}</p>
                  <p className="text-[11px] text-cc-text-mut mt-1 font-mono">{pole.device_id || 'No Sensor Fitted'}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Lines connecting Parent to Child Poles (Known or Geometrically Inferred) */}
        {network.poles?.map((pole: any) => {
          const parentId = pole.parent_pole_id || pole.inferred_parent_pole_id;
          if (!parentId) return null;
          const parent = polesMap.get(parentId);
          if (!parent) return null;

          const isInferred = !pole.parent_pole_id && !!pole.inferred_parent_pole_id;
          const isDark = darkPoleIds.has(pole.pole_id) || pole.is_energized === false;
          const isLowConf = lowConfPoles.has(pole.pole_id) || isInferred;

          let lineColor = isInferred ? '#8a8679' : '#3a3a32';
          if (isDark) lineColor = isLowConf ? '#c4a035' : '#c0392b';

          return (
            <Polyline
              key={`line-${parentId}-${pole.pole_id}`}
              positions={[
                [parent.lat, parent.lon],
                [pole.lat, pole.lon]
              ]}
              pathOptions={{
                color: lineColor,
                weight: isDark ? 3 : (isInferred ? 1.5 : 1.5),
                opacity: isDark ? 0.9 : (isInferred ? 0.6 : 0.4),
                dashArray: isInferred ? '6, 6' : (isLowConf ? '4, 4' : undefined)
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
