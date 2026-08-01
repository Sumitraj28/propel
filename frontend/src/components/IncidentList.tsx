'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, Users, Wrench, Sparkles, RotateCcw } from 'lucide-react';

interface Ticket {
  ticket_id: string;
  fault_type: string;
  status: string;
  asset_id: string;
  dt_id: string;
  feeder_id: string;
  lat: number;
  lon: number;
  pincode: string;
  affected_pole_count: number;
  affected_households: number;
  confidence_score: number;
  confidence_level: 'HIGH' | 'LOW';
  confidence_reason: string;
  ai_summary?: string;
  affected_pole_ids?: string[];
  detected_at: string;
}

interface IncidentListProps {
  tickets: Ticket[];
  onUpdateStatus: (ticketId: string, status: string) => Promise<void>;
  onRepair: (ticketId: string) => Promise<void>;
}

export default function IncidentList({ tickets, onUpdateStatus, onRepair }: IncidentListProps) {
  const [loadingTicketId, setLoadingTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAction = async (ticketId: string, action: () => Promise<void>) => {
    setLoadingTicketId(ticketId);
    setErrorMessage(null);
    try {
      await action();
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed');
    } finally {
      setLoadingTicketId(null);
    }
  };

  if (tickets.length === 0) {
    return (
      <div className="bg-cc-card border border-cc-border rounded p-8 text-center">
        <CheckCircle className="w-10 h-10 text-cc-green mx-auto mb-3" />
        <h3 className="text-sm font-bold text-cc-text">No Active Fault Incidents</h3>
        <p className="text-[11px] text-cc-text-mut mt-1">All distribution poles across KSPDB grid are energized and reporting healthy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="bg-cc-red-bg border border-cc-red/30 text-cc-text p-3 rounded flex items-start gap-2 text-[11px]">
          <AlertTriangle className="w-4 h-4 text-cc-red shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Resolution Rejected: </span>
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-cc-text-sec hover:text-cc-text text-xs font-bold">✕</button>
        </div>
      )}

      {tickets.map(tkt => {
        const isHighConf = tkt.confidence_level === 'HIGH';
        const isVerified = tkt.status === 'verified' || tkt.status === 'closed';

        // Fault type badge color
        let faultBadgeBg = 'bg-cc-red-bg text-cc-red border-cc-red/30';
        if (tkt.fault_type === 'dt') faultBadgeBg = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
        if (tkt.fault_type === 'feeder') faultBadgeBg = 'bg-cc-red-bg text-cc-red border-cc-red/30';

        // Status badge
        let statusBg = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
        if (tkt.status === 'acknowledged') statusBg = 'bg-cc-olive-bg text-cc-olive border-cc-olive/30';
        if (tkt.status === 'crew_assigned') statusBg = 'bg-cc-gold-bg text-cc-gold border-cc-gold/30';
        if (tkt.status === 'resolved') statusBg = 'bg-cc-olive-bg text-cc-olive border-cc-olive/30';
        if (tkt.status === 'verified') statusBg = 'bg-cc-green-bg text-cc-green border-cc-green/30';

        return (
          <div
            key={tkt.ticket_id}
            className={`bg-cc-card border rounded p-4 transition-colors ${
              isVerified
                ? 'border-cc-green/20'
                : isHighConf
                ? 'border-cc-red/30'
                : 'border-cc-gold/30'
            }`}
          >
            {/* Header / Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cc-border pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-[10px] font-bold rounded tracking-wider uppercase border ${faultBadgeBg}`}>
                  {tkt.fault_type} FAULT
                </span>

                <span className={`px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 border ${
                  isHighConf
                    ? 'bg-cc-green-bg text-cc-green border-cc-green/30'
                    : 'bg-cc-gold-bg text-cc-gold border-cc-gold/30'
                }`}>
                  <ShieldAlert className="w-3 h-3" />
                  {tkt.confidence_level} CONFIDENCE ({Math.round(tkt.confidence_score * 100)}%)
                </span>
              </div>

              <span className={`text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider border ${statusBg}`}>
                STATUS: {tkt.status.replace('_', ' ')}
              </span>
            </div>

            {/* Asset & Location Info */}
            <div className="grid grid-cols-2 gap-2.5 text-[11px] mb-2.5">
              <div>
                <span className="text-cc-text-mut text-[10px] block uppercase tracking-wider">Target Asset / Span</span>
                <span className="font-mono font-bold text-cc-text">{tkt.asset_id}</span>
              </div>

              <div>
                <span className="text-cc-text-mut text-[10px] block uppercase tracking-wider">Location & PIN Code</span>
                <span className="font-semibold text-cc-text">
                  PIN {tkt.pincode} <span className="text-cc-text-mut font-normal">({tkt.lat.toFixed(4)}, {tkt.lon.toFixed(4)})</span>
                </span>
              </div>

              <div>
                <span className="text-cc-text-mut text-[10px] block uppercase tracking-wider">Impact Scale</span>
                <span className="font-semibold text-cc-gold">
                  {tkt.affected_households} Households <span className="text-cc-text-mut font-normal">({tkt.affected_pole_count} dark poles)</span>
                </span>
              </div>

              <div>
                <span className="text-cc-text-mut text-[10px] block uppercase tracking-wider">Localization Assessment</span>
                <span className="text-cc-text-sec text-[10px]">{tkt.confidence_reason}</span>
              </div>
            </div>

            {/* AI Natural Language Summary */}
            {tkt.ai_summary && (
              <div className="bg-cc-inner border border-cc-border rounded p-2.5 text-[11px] text-cc-text-sec flex items-start gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-cc-gold shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-cc-gold block mb-0.5 text-[10px] uppercase tracking-wider">AI Operator Advisory</span>
                  {tkt.ai_summary}
                </div>
              </div>
            )}

            {/* Action Workflow Buttons */}
            {!isVerified && (
              <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-cc-border">
                {tkt.status === 'detected' && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'acknowledged'))}
                    className="px-2.5 py-1.5 text-[10px] font-bold bg-cc-olive-bg hover:bg-cc-olive-dim border border-cc-olive/30 text-cc-text rounded transition-colors disabled:opacity-40"
                  >
                    Acknowledge Fault
                  </button>
                )}

                {(tkt.status === 'detected' || tkt.status === 'acknowledged') && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'crew_assigned'))}
                    className="px-2.5 py-1.5 text-[10px] font-bold bg-cc-gold-bg hover:bg-cc-gold-dim border border-cc-gold/30 text-cc-text rounded transition-colors flex items-center gap-1 disabled:opacity-40"
                  >
                    <Users className="w-3 h-3" />
                    Assign Field Crew
                  </button>
                )}

                {tkt.status !== 'resolved' && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'resolved'))}
                    className="px-2.5 py-1.5 text-[10px] font-bold bg-cc-inner hover:bg-cc-border border border-cc-border text-cc-text rounded transition-colors flex items-center gap-1 disabled:opacity-40"
                  >
                    <Wrench className="w-3 h-3" />
                    Mark Resolved
                  </button>
                )}

                {/* Simulator Repair Shortcut */}
                <button
                  disabled={loadingTicketId === tkt.ticket_id}
                  onClick={() => handleAction(tkt.ticket_id, () => onRepair(tkt.ticket_id))}
                  className="px-2.5 py-1.5 text-[10px] font-bold bg-cc-green-bg hover:bg-cc-green-dim border border-cc-green/30 text-cc-green rounded transition-colors flex items-center gap-1 ml-auto disabled:opacity-40"
                >
                  <RotateCcw className="w-3 h-3" />
                  Simulate Restore
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
