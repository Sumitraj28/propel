'use client';

import { useState } from 'react';
import { Zap, AlertOctagon, Radio, ShieldOff, Calendar, RefreshCcw } from 'lucide-react';
import LiveTelemetryFeed from './LiveTelemetryFeed';
import LiveTicketStatus from './LiveTicketStatus';

interface SimulatorProps {
  network: any;
  onInject: (type: string, targetId: string) => Promise<void>;
  onOutage: (scope: string, targetId: string) => Promise<void>;
  onSeed: () => Promise<void>;
}

export default function SimulatorControls({ network, onInject, onOutage, onSeed }: SimulatorProps) {
  const [selectedPole, setSelectedPole] = useState('');
  const [selectedDT, setSelectedDT] = useState('');
  const [selectedFeeder, setSelectedFeeder] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const poles = network?.poles || [];
  const dts = network?.transformers || [];
  const feeders = network?.feeders || [];

  const handleAction = async (actionFn: () => Promise<any>, successMsg: string) => {
    setLoading(true);
    setStatusText(null);
    try {
      await actionFn();
      setStatusText(`✅ ${successMsg}`);
    } catch (err: any) {
      setStatusText(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-slate-100">Fault & Telemetry Simulator</h3>
          </div>
          <button
            disabled={loading}
            onClick={() => handleAction(onSeed, 'Database re-seeded with synthetic network data.')}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Reset & Seed Data
          </button>
        </div>

        {statusText && (
          <div className="mb-4 text-xs font-mono p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-200">
            {statusText}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Inject Span Fault */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              Span Fault
            </label>
            <select
              value={selectedPole}
              onChange={(e) => setSelectedPole(e.target.value)}
              className="w-full text-xs bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 mb-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Select Target Pole --</option>
              {poles.slice(0, 100).map((p: any) => (
                <option key={p.pole_id} value={p.pole_id}>
                  {p.pole_id} ({p.topology_type?.toUpperCase()})
                </option>
              ))}
            </select>
            <button
              disabled={loading || !selectedPole}
              onClick={() => handleAction(() => onInject('span', selectedPole), `Span fault injected starting at ${selectedPole}`)}
              className="w-full text-xs font-bold bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white rounded p-1.5 transition"
            >
              Inject Span Fault
            </button>
          </div>

          {/* 2. Inject DT Fault */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              DT Fault (Transformer)
            </label>
            <select
              value={selectedDT}
              onChange={(e) => setSelectedDT(e.target.value)}
              className="w-full text-xs bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 mb-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Select Transformer --</option>
              {dts.map((d: any) => (
                <option key={d.dt_id} value={d.dt_id}>
                  {d.dt_id} ({d.capacity_kva} kVA)
                </option>
              ))}
            </select>
            <button
              disabled={loading || !selectedDT}
              onClick={() => handleAction(() => onInject('dt', selectedDT), `DT fault injected for ${selectedDT}`)}
              className="w-full text-xs font-bold bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded p-1.5 transition"
            >
              Inject DT Fault
            </button>
          </div>

          {/* 3. Inject Feeder Fault */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              Feeder Fault
            </label>
            <select
              value={selectedFeeder}
              onChange={(e) => setSelectedFeeder(e.target.value)}
              className="w-full text-xs bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 mb-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Select 11kV Feeder --</option>
              {feeders.map((f: any) => (
                <option key={f.feeder_id} value={f.feeder_id}>
                  {f.name} ({f.feeder_id})
                </option>
              ))}
            </select>
            <button
              disabled={loading || !selectedFeeder}
              onClick={() => handleAction(() => onInject('feeder', selectedFeeder), `Feeder fault injected for ${selectedFeeder}`)}
              className="w-full text-xs font-bold bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded p-1.5 transition"
            >
              Inject Feeder Fault
            </button>
          </div>

          {/* 4. Single Dead Sensor & Scheduled Outage */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1">
              <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
              Noise & Outages
            </label>
            <div className="space-y-1.5">
              <button
                disabled={loading || !selectedPole}
                onClick={() => handleAction(() => onInject('dead_sensor', selectedPole), `Single dead sensor injected for ${selectedPole} (no ticket created)`)}
                className="w-full text-[11px] font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 rounded p-1.5 border border-slate-700 transition"
              >
                Inject Single Dead Sensor
              </button>

              <button
                disabled={loading || !selectedDT}
                onClick={() => handleAction(() => onOutage('dt', selectedDT), `Scheduled outage injected for DT ${selectedDT}`)}
                className="w-full text-[11px] font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 rounded p-1.5 border border-slate-700 transition flex items-center justify-center gap-1"
              >
                <Calendar className="w-3 h-3" />
                Schedule DT Outage
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Row for Live Real-Time Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800">
        <LiveTelemetryFeed />
        <LiveTicketStatus />
      </div>
    </div>
  );
}
