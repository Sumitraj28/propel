'use client';

import { useEffect, useState, useRef } from 'react';
import { Activity, Radio } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TelemetryEvent {
  id: string;
  device_id: string;
  pole_id: string;
  event: string;
  energized: boolean;
  ts: string;
  received_at: string;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return 'just now';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export default function LiveTelemetryFeed() {
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prevTopIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/telemetry/recent?limit=30`);
        if (!res.ok) return;
        const data: TelemetryEvent[] = await res.json();

        if (isMounted) {
          if (data.length > 0) {
            const latestId = data[0].id;
            if (prevTopIdRef.current && prevTopIdRef.current !== latestId) {
              setHighlightedId(latestId);
              setTimeout(() => setHighlightedId(null), 1500);
            }
            prevTopIdRef.current = latestId;
          }
          setTelemetry(data.slice(0, 30));
          setLoading(false);
        }
      } catch (err) {
        console.error('[LiveTelemetryFeed] Error polling telemetry:', err);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-cc-inner border border-cc-border rounded p-3.5 flex flex-col h-[300px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cc-border pb-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cc-gold" />
          <h4 className="font-bold text-[10px] uppercase tracking-wider text-cc-text">
            Live Telemetry Feed (3s Poll)
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-cc-red rounded-full cc-dot-pulse" />
          <span className="text-[9px] font-bold text-cc-red uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1fr_100px_80px_60px] gap-2 px-2 py-1.5 text-[9px] text-cc-text-mut uppercase tracking-wider font-bold border-b border-cc-border">
        <span>Asset ID</span>
        <span>Event</span>
        <span>Status</span>
        <span className="text-right">Time</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-cc-text-mut">
          Connecting to telemetry stream...
        </div>
      ) : telemetry.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[11px] text-cc-text-mut gap-1 text-center p-4">
          <Radio className="w-6 h-6 text-cc-border mb-1" />
          <span>No Telemetry Received Yet</span>
          <span className="text-[10px] text-cc-text-mut">Inject a fault above to observe live device telemetry.</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto cc-scroll text-[11px] font-mono">
          {telemetry.map(item => {
            const isHighlighted = highlightedId === item.id;

            let badgeStyle = 'bg-cc-card text-cc-text-sec border-cc-border';
            let badgeLabel = item.event.toUpperCase();

            if (item.event === 'power_lost') {
              badgeStyle = 'bg-cc-red-bg text-cc-red border-cc-red/30';
            } else if (item.event === 'power_restored') {
              badgeStyle = 'bg-cc-green-bg text-cc-green border-cc-green/30';
              badgeLabel = 'POWER_RESTORED';
            } else if (item.event === 'boot') {
              badgeStyle = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
            } else if (item.event === 'heartbeat') {
              badgeStyle = 'bg-cc-card text-cc-text-mut border-cc-border';
            }

            return (
              <div
                key={item.id}
                className={`grid grid-cols-[1fr_100px_80px_60px] gap-2 items-center px-2 py-1.5 border-b border-cc-border/50 transition-colors ${
                  isHighlighted ? 'cc-row-flash' : 'hover:bg-cc-card'
                }`}
              >
                <span className="font-bold text-cc-text truncate">{item.pole_id}</span>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border text-center ${badgeStyle}`}>
                  {badgeLabel}
                </span>
                <span className="text-cc-text-sec">{formatRelativeTime(item.ts)}</span>
                <span className="text-cc-text-mut text-right">{formatRelativeTime(item.received_at || item.ts)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
