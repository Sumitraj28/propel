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
    const interval = setInterval(fetchTelemetry, 3000); // 3s polling loop

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col h-[320px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">
            Live Telemetry Feed (3s poll)
          </h4>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          Last 30 Events
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          Connecting to telemetry stream...
        </div>
      ) : telemetry.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 gap-1 text-center p-4">
          <Radio className="w-8 h-8 text-slate-700 mb-1" />
          <span>No Telemetry Received Yet</span>
          <span className="text-[11px] text-slate-600">Inject a fault above to observe live device telemetry.</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
          {telemetry.map(item => {
            const isHighlighted = highlightedId === item.id;
            let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';

            if (item.event === 'power_lost') {
              badgeStyle = 'bg-red-950/90 text-red-400 border-red-800';
            } else if (item.event === 'power_restored') {
              badgeStyle = 'bg-emerald-950/90 text-emerald-400 border-emerald-800';
            } else if (item.event === 'boot') {
              badgeStyle = 'bg-blue-950/90 text-blue-400 border-blue-800';
            } else if (item.event === 'heartbeat') {
              badgeStyle = 'bg-slate-900 text-slate-400 border-slate-800';
            }

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-2 rounded border transition-all duration-500 ${
                  isHighlighted
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950'
                    : 'bg-slate-900/80 border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-slate-100">{item.pole_id}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${badgeStyle}`}>
                    {item.event}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatRelativeTime(item.received_at || item.ts)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
