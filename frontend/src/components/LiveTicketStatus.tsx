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
    const interval = setInterval(fetchLiveTickets, 3000);

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
          <ShieldAlert className="w-3.5 h-3.5 text-cc-red" />
          <h4 className="font-bold text-[10px] uppercase tracking-wider text-cc-text">
            Live Ticket Status (3s Poll)
          </h4>
        </div>
        <span className="text-[9px] font-mono text-cc-text-sec bg-cc-card px-2 py-0.5 rounded border border-cc-border">
          {tickets.length} Active
        </span>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[80px_70px_1fr_70px_70px_80px] gap-2 px-2 py-1.5 text-[9px] text-cc-text-mut uppercase tracking-wider font-bold border-b border-cc-border">
        <span>Ticket</span>
        <span>Type</span>
        <span>Asset</span>
        <span>Impact</span>
        <span>Confidence</span>
        <span className="text-right">Status</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-cc-text-mut">
          Fetching live incident tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[11px] text-cc-text-mut gap-1 text-center p-4">
          <CheckCircle2 className="w-6 h-6 text-cc-green mb-1" />
          <span className="font-bold text-cc-text">No Active Incidents</span>
          <span className="text-[10px] text-cc-text-mut">All power distribution spans are energized and reporting normal.</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto cc-scroll text-[11px]">
          {tickets.map(tkt => {
            const isChanged = changedTicketIds.has(tkt.id);
            const isHighConf = tkt.confidence === 'HIGH';

            let statusPill = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
            if (tkt.status === 'acknowledged') statusPill = 'bg-cc-olive-bg text-cc-olive border-cc-olive/30';
            if (tkt.status === 'crew_assigned') statusPill = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
            if (tkt.status === 'resolved') statusPill = 'bg-cc-olive-bg text-cc-olive border-cc-olive/30';
            if (tkt.status === 'verified') statusPill = 'bg-cc-green-bg text-cc-green border-cc-green/30';

            let typeLabel = tkt.fault_type.charAt(0).toUpperCase() + tkt.fault_type.slice(1) + ' Fault';

            return (
              <div
                key={tkt.id}
                className={`grid grid-cols-[80px_70px_1fr_70px_70px_80px] gap-2 items-center px-2 py-2 border-b border-cc-border/50 transition-colors ${
                  isChanged ? 'cc-row-flash' : 'hover:bg-cc-card'
                }`}
              >
                <span className="font-mono font-bold text-cc-text truncate">{tkt.ticket_id || tkt.id.slice(0, 10)}</span>
                <span className="text-cc-text-sec">{typeLabel}</span>
                <span className="text-cc-text truncate font-medium">{tkt.location_summary}</span>
                <span className="text-cc-text-sec">{tkt.poles_affected} Dark</span>
                <span className={`text-[10px] font-bold ${isHighConf ? 'text-cc-green' : 'text-cc-gold'}`}>
                  {tkt.confidence} ({tkt.confidence_score ? Math.round(tkt.confidence_score * 100) : '95'}%)
                </span>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border text-center uppercase ${statusPill}`}>
                  {tkt.status.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
