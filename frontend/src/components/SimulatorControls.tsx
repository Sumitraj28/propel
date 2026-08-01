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
    <div className="bg-cc-card border border-cc-border rounded p-4 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-cc-border pb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-cc-gold" />
          <h3 className="text-[12px] font-bold text-cc-text uppercase tracking-wider">Fault & Telemetry Simulator</h3>
        </div>
        <button
          disabled={loading}
          onClick={() => handleAction(onSeed, 'Database re-seeded with synthetic network data.')}
          className="text-[10px] bg-cc-inner hover:bg-cc-border text-cc-text-sec px-2.5 py-1.5 rounded border border-cc-border flex items-center gap-1.5 transition-colors disabled:opacity-40"
        >
          <RefreshCcw className="w-3 h-3" />
          Reset & Seed Data
        </button>
      </div>

      {statusText && (
        <div className="text-[11px] font-mono p-2 rounded bg-cc-inner border border-cc-border text-cc-text-sec">
          {statusText}
        </div>
      )}

      {/* Injection Controls Grid */}
      <div className="grid grid-cols-4 gap-3">
        {/* 1. Span Fault */}
        <div className="bg-cc-inner border border-cc-border rounded p-3">
          <label className="text-[10px] font-bold text-cc-text-sec block mb-1.5 flex items-center gap-1 uppercase tracking-wider">
            <AlertOctagon className="w-3 h-3 text-cc-red" />
            Span Fault
          </label>
          <select
            value={selectedPole}
            onChange={(e) => setSelectedPole(e.target.value)}
            className="w-full text-[11px] bg-cc-card border border-cc-border text-cc-text rounded p-1.5 mb-2 focus:outline-none focus:border-cc-gold"
          >
            <option value="">Select Target Pole / Span</option>
            {poles.slice(0, 100).map((p: any) => (
              <option key={p.pole_id} value={p.pole_id}>
                {p.pole_id} ({p.topology_type?.toUpperCase()})
              </option>
            ))}
          </select>
          <button
            disabled={loading || !selectedPole}
            onClick={() => handleAction(() => onInject('span', selectedPole), `Span fault injected starting at ${selectedPole}`)}
            className="w-full text-[10px] font-bold bg-cc-red-bg hover:bg-cc-red-dim border border-cc-red/30 text-cc-red rounded p-1.5 transition-colors disabled:opacity-40"
          >
            Inject Span Fault
          </button>
        </div>

        {/* 2. DT Fault */}
        <div className="bg-cc-inner border border-cc-border rounded p-3">
          <label className="text-[10px] font-bold text-cc-text-sec block mb-1.5 flex items-center gap-1 uppercase tracking-wider">
            <Radio className="w-3 h-3 text-cc-gold" />
            DT Fault (Transformer)
          </label>
          <select
            value={selectedDT}
            onChange={(e) => setSelectedDT(e.target.value)}
            className="w-full text-[11px] bg-cc-card border border-cc-border text-cc-text rounded p-1.5 mb-2 focus:outline-none focus:border-cc-gold"
          >
            <option value="">Select Transformer</option>
            {dts.map((d: any) => (
              <option key={d.dt_id} value={d.dt_id}>
                {d.dt_id} ({d.capacity_kva} kVA)
              </option>
            ))}
          </select>
          <button
            disabled={loading || !selectedDT}
            onClick={() => handleAction(() => onInject('dt', selectedDT), `DT fault injected for ${selectedDT}`)}
            className="w-full text-[10px] font-bold bg-cc-gold-bg hover:bg-cc-gold-dim border border-cc-gold/30 text-cc-gold rounded p-1.5 transition-colors disabled:opacity-40"
          >
            Inject DT Fault
          </button>
        </div>

        {/* 3. Feeder Fault */}
        <div className="bg-cc-inner border border-cc-border rounded p-3">
          <label className="text-[10px] font-bold text-cc-text-sec block mb-1.5 flex items-center gap-1 uppercase tracking-wider">
            <Zap className="w-3 h-3 text-cc-red" />
            Feeder Fault
          </label>
          <select
            value={selectedFeeder}
            onChange={(e) => setSelectedFeeder(e.target.value)}
            className="w-full text-[11px] bg-cc-card border border-cc-border text-cc-text rounded p-1.5 mb-2 focus:outline-none focus:border-cc-gold"
          >
            <option value="">Select 11kV Feeder</option>
            {feeders.map((f: any) => (
              <option key={f.feeder_id} value={f.feeder_id}>
                {f.name} ({f.feeder_id})
              </option>
            ))}
          </select>
          <button
            disabled={loading || !selectedFeeder}
            onClick={() => handleAction(() => onInject('feeder', selectedFeeder), `Feeder fault injected for ${selectedFeeder}`)}
            className="w-full text-[10px] font-bold bg-cc-red-bg hover:bg-cc-red-dim border border-cc-red/30 text-cc-red rounded p-1.5 transition-colors disabled:opacity-40"
          >
            Inject Feeder Fault
          </button>
        </div>

        {/* 4. Noise & Outages */}
        <div className="bg-cc-inner border border-cc-border rounded p-3">
          <label className="text-[10px] font-bold text-cc-text-sec block mb-1.5 flex items-center gap-1 uppercase tracking-wider">
            <ShieldOff className="w-3 h-3 text-cc-gold" />
            Noise & Outages
          </label>
          <div className="space-y-1.5">
            <button
              disabled={loading || !selectedPole}
              onClick={() => handleAction(() => onInject('dead_sensor', selectedPole), `Single dead sensor injected for ${selectedPole} (no ticket created)`)}
              className="w-full text-[10px] font-bold bg-cc-card hover:bg-cc-border text-cc-gold border border-cc-border rounded p-1.5 transition-colors disabled:opacity-40"
            >
              Inject Single Dead Sensor
            </button>

            <button
              disabled={loading || !selectedDT}
              onClick={() => handleAction(() => onOutage('dt', selectedDT), `Scheduled outage injected for DT ${selectedDT}`)}
              className="w-full text-[10px] font-bold bg-cc-card hover:bg-cc-border text-cc-text-sec border border-cc-border rounded p-1.5 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <Calendar className="w-3 h-3" />
              Schedule DT Outage
            </button>
          </div>
        </div>
      </div>

      {/* Live Real-Time Panels */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-cc-border">
        <LiveTelemetryFeed />
        <LiveTicketStatus />
      </div>
    </div>
  );
}
