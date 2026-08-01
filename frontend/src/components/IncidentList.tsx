'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, Users, Wrench, Sparkles, RefreshCw } from 'lucide-react';

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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-200">No Active Fault Incidents</h3>
        <p className="text-sm text-slate-400 mt-1">All distribution poles across KSPDB grid are energized and reporting healthy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 p-4 rounded-xl flex items-start gap-3 text-sm animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Resolution Rejected: </span>
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-xs font-bold">✕</button>
        </div>
      )}

      {tickets.map(tkt => {
        const isHighConf = tkt.confidence_level === 'HIGH';
        const isVerified = tkt.status === 'verified' || tkt.status === 'closed';

        return (
          <div
            key={tkt.ticket_id}
            className={`bg-slate-900 border rounded-xl p-5 transition-all shadow-lg ${
              isVerified
                ? 'border-emerald-900/50 bg-slate-950/60'
                : isHighConf
                ? 'border-red-900/60 hover:border-red-600/60'
                : 'border-amber-900/60 hover:border-amber-600/60'
            }`}
          >
            {/* Header / Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 text-xs font-black rounded-md tracking-wider uppercase ${
                    tkt.fault_type === 'feeder'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800'
                      : tkt.fault_type === 'dt'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {tkt.fault_type} FAULT
                </span>

                {/* Confidence Pill — Visibly distinguished */}
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 border ${
                    isHighConf
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {tkt.confidence_level} CONFIDENCE ({Math.round(tkt.confidence_score * 100)}%)
                </span>
              </div>

              {/* Status Badge */}
              <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                tkt.status === 'detected' ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' :
                tkt.status === 'acknowledged' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                tkt.status === 'crew_assigned' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                tkt.status === 'resolved' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                STATUS: {tkt.status.replace('_', ' ')}
              </span>
            </div>

            {/* Asset & Location Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <span className="text-slate-400 text-xs block">Target Asset / Span</span>
                <span className="font-mono font-bold text-slate-100">{tkt.asset_id}</span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block">Location & PIN Code</span>
                <span className="font-semibold text-slate-200">
                  PIN {tkt.pincode} <span className="text-slate-400 font-normal">({tkt.lat.toFixed(4)}, {tkt.lon.toFixed(4)})</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block">Impact Scale</span>
                <span className="font-semibold text-amber-300">
                  {tkt.affected_households} Households <span className="text-slate-400 font-normal">({tkt.affected_pole_count} dark poles)</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-xs block">Localization Assessment</span>
                <span className="text-slate-300 text-xs">{tkt.confidence_reason}</span>
              </div>
            </div>

            {/* AI Natural Language Summary */}
            {tkt.ai_summary && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-cyan-300 block mb-0.5">AI Operator Advisory</span>
                  {tkt.ai_summary}
                </div>
              </div>
            )}

            {/* Action Workflow Buttons */}
            {!isVerified && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                {tkt.status === 'detected' && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'acknowledged'))}
                    className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                  >
                    Acknowledge Fault
                  </button>
                )}

                {(tkt.status === 'detected' || tkt.status === 'acknowledged') && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'crew_assigned'))}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-1"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Assign Field Crew
                  </button>
                )}

                {tkt.status !== 'resolved' && (
                  <button
                    disabled={loadingTicketId === tkt.ticket_id}
                    onClick={() => handleAction(tkt.ticket_id, () => onUpdateStatus(tkt.ticket_id, 'resolved'))}
                    className="px-3 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition flex items-center gap-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Mark Resolved (Check Telemetry)
                  </button>
                )}

                {/* Simulator Repair Shortcut */}
                <button
                  disabled={loadingTicketId === tkt.ticket_id}
                  onClick={() => handleAction(tkt.ticket_id, () => onRepair(tkt.ticket_id))}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition flex items-center gap-1 ml-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Simulate Power Restoration
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
