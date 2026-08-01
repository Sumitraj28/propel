'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react_leaflet';
import L from 'leaflet';

// Fix leafet icon default issue in SSR / Next.js
const subIcon = L.divIcon({
  className: 'custom-sub-icon',
  html: '<div style="background-color: #ef4444; width: 18px; height: 18px; border-radius: 4px; border: 2px solid white; box-shadow: 0 0 8px #ef4444;"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const dtIcon = L.divIcon({
  className: 'custom-dt-icon',
  html: '<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px #3b82f6;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
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
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 rounded-xl">
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
    <div className="w-full h-full relative rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      <MapContainer center={center} zoom={14} scrollWheelZoom={true} className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Substations */}
        {network.substations?.map((sub: any) => (
          <Marker key={sub.substation_id} position={[sub.lat, sub.lon]} icon={subIcon}>
            <Popup>
              <div className="text-slate-900 p-1">
                <h4 className="font-bold text-sm">{sub.name}</h4>
                <p className="text-xs text-slate-600">Substation Code: {sub.code}</p>
                <p className="text-xs text-slate-500">({sub.lat.toFixed(4)}, {sub.lon.toFixed(4)})</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* DTs */}
        {network.transformers?.map((dt: any) => (
          <Marker key={dt.dt_id} position={[dt.lat, dt.lon]} icon={dtIcon}>
            <Popup>
              <div className="text-slate-900 p-1">
                <h4 className="font-bold text-sm">Transformer: {dt.dt_id}</h4>
                <p className="text-xs text-slate-600">Capacity: {dt.capacity_kva} kVA</p>
                <p className="text-xs text-slate-600">Households Served: {dt.households_served}</p>
                <p className="text-xs text-slate-500">Feeder: {dt.feeder_id}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Poles */}
        {network.poles?.map((pole: any) => {
          const isDark = darkPoleIds.has(pole.pole_id) || pole.is_energized === false;
          const isLowConf = lowConfPoles.has(pole.pole_id);
          const hasDevice = !!pole.device_id;

          let color = '#22c55e'; // Energized green
          if (!hasDevice) color = '#94a3b8'; // No device gray
          if (isDark) color = isLowConf ? '#f97316' : '#ef4444'; // Orange for low conf, Red for high conf

          return (
            <CircleMarker
              key={pole.pole_id}
              center={[pole.lat, pole.lon]}
              radius={isDark ? 6 : 4}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.9,
                weight: isDark ? 3 : 1
              }}
              eventHandlers={{
                click: () => onSelectPole && onSelectPole(pole.pole_id)
              }}
            >
              <Popup>
                <div className="text-slate-900 p-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm">{pole.pole_id}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {isDark ? 'DARK' : 'LIVE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">DT: {pole.dt_id} | Feeder: {pole.feeder_id}</p>
                  <p className="text-xs text-slate-600">Topology: {pole.topology_type?.toUpperCase()}</p>
                  {pole.parent_pole_id && <p className="text-xs text-slate-500">Parent: {pole.parent_pole_id}</p>}
                  <p className="text-xs text-slate-500">Ward: {pole.ward} | PIN: {pole.pincode}</p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">{pole.device_id || 'No Sensor Fitted'}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Lines connecting Parent to Child Poles */}
        {network.poles?.map((pole: any) => {
          if (!pole.parent_pole_id) return null;
          const parent = polesMap.get(pole.parent_pole_id);
          if (!parent) return null;

          const isDark = darkPoleIds.has(pole.pole_id) || pole.is_energized === false;
          const isLowConf = lowConfPoles.has(pole.pole_id);
          let lineColor = '#1e293b';
          if (isDark) lineColor = isLowConf ? '#f97316' : '#ef4444';

          return (
            <Polyline
              key={`line-${pole.parent_pole_id}-${pole.pole_id}`}
              positions={[
                [parent.lat, parent.lon],
                [pole.lat, pole.lon]
              ]}
              pathOptions={{
                color: lineColor,
                weight: isDark ? 3 : 1.5,
                opacity: isDark ? 0.9 : 0.4,
                dashArray: isLowConf ? '4, 4' : undefined
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
