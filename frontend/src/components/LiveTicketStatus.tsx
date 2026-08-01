'use client';

import { useEffect, useState, useRef } from 'react';
import { ShieldAlert, AlertOctagon, Radio, Zap, CheckCircle2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface LiveTicket {
  id: string;
  ticket_id?: string;
  fault_type: string;
  location_summary: string;
  pin_code: string;
  confidence: 'HIGH' | 'LOW';
  confidence_score?: number;
  poles_affected: number;
  status: string;
  updated_at: string;
}

export default function LiveTicketStatus() {
  const [tickets, setTickets] = useState<LiveTicket[]>([]);
  const [changedTicketIds, setChangedTicketIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let isMounted = true;

    const fetchLiveTickets = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tickets/live`);
        if (!res.ok) return;
        const data: LiveTicket[] = await res.json();

        if (isMounted) {
          const newChanged = new Set<string>();
          const currentStatuses = new Map<string, string>();

          for (const tkt of data) {
            currentStatuses.set(tkt.id, tkt.status);
            const prevStatus = prevStatusesRef.current.get(tkt.id);
            if (prevStatus && prevStatus !== tkt.status) {
              newChanged.add(tkt.id);
            }
          }

          if (newChanged.size > 0) {
            setChangedTicketIds(newChanged);
            setTimeout(() => setChangedTicketIds(new Set()), 2000);
          }

          prevStatusesRef.current = currentStatuses;
          setTickets(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[LiveTicketStatus] Error polling live tickets:', err);
      }
    };

    fetchLiveTickets();
    const interval = setInterval(fetchLiveTickets, 3000); // 3s polling loop

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col h-[320px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">
            Live Ticket Status (3s poll)
          </h4>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          {tickets.length} Active
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          Fetching live incident tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 gap-1 text-center p-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-1" />
          <span className="font-bold text-slate-300">No Active Incidents</span>
          <span className="text-[11px] text-slate-500">All power distribution spans are energized and reporting normal.</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
          {tickets.map(tkt => {
            const isChanged = changedTicketIds.has(tkt.id);
            const isHighConf = tkt.confidence === 'HIGH';

            let statusPill = 'bg-amber-950/80 text-amber-400 border-amber-800';
            if (tkt.status === 'acknowledged') statusPill = 'bg-blue-950/80 text-blue-400 border-blue-800';
            if (tkt.status === 'crew_assigned') statusPill = 'bg-indigo-950/80 text-indigo-400 border-indigo-800';
            if (tkt.status === 'resolved') statusPill = 'bg-purple-950/80 text-purple-400 border-purple-800';
            if (tkt.status === 'verified') statusPill = 'bg-emerald-950/80 text-emerald-400 border-emerald-800';

            return (
              <div
                key={tkt.id}
                className={`p-2.5 rounded-lg border transition-all duration-500 ${
                  isChanged
                    ? 'bg-amber-950/50 border-amber-400 text-amber-200 shadow-md shadow-amber-950 animate-pulse'
                    : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 truncate">
                    {tkt.fault_type === 'span' && <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    {tkt.fault_type === 'dt' && <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    {tkt.fault_type === 'feeder' && <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                    <span className="font-bold text-slate-100 truncate">{tkt.location_summary}</span>
                  </div>

                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase shrink-0 ${statusPill}`}>
                    {tkt.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>PIN {tkt.pin_code} · {tkt.poles_affected} poles dark</span>
                  <span className={`font-semibold ${isHighConf ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {tkt.confidence} CONF
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
