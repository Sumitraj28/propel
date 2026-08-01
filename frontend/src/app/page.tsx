'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/Header';
import IncidentList from '../components/IncidentList';
import SimulatorControls from '../components/SimulatorControls';
import { AlertTriangle, Activity, Radio, ShieldCheck } from 'lucide-react';

const MapView = dynamic(() => import('../components/Map'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function OperatorConsole() {
  const [network, setNetwork] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const isFetchingRef = useRef(false);

  const fetchInitial = useCallback(async () => {
    try {
      const [netRes, tktRes] = await Promise.all([
        fetch(`${API_BASE}/api/network`),
        fetch(`${API_BASE}/api/tickets`)
      ]);

      if (netRes.ok) {
        const netData = await netRes.json();
        setNetwork(netData);
      }

      if (tktRes.ok) {
        const tktData = await tktRes.json();
        setTickets(tktData);
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching initial KSPDB network data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const pollLiveState = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [polesRes, tktRes] = await Promise.all([
        fetch(`${API_BASE}/api/poles/live-state`),
        fetch(`${API_BASE}/api/tickets`)
      ]);

      if (polesRes.ok) {
        const livePoles = await polesRes.json();
        const liveStateMap = new Map<string, boolean>();
        livePoles.forEach((lp: any) => liveStateMap.set(lp.pole_id, lp.energized));

        setNetwork((prevNet: any) => {
          if (!prevNet || !prevNet.poles) return prevNet;
          let changed = false;
          const updatedPoles = prevNet.poles.map((p: any) => {
            if (liveStateMap.has(p.pole_id)) {
              const newEnergized = liveStateMap.get(p.pole_id);
              if (p.is_energized !== newEnergized) {
                changed = true;
                return { ...p, is_energized: newEnergized };
              }
            }
            return p;
          });
          return changed ? { ...prevNet, poles: updatedPoles } : prevNet;
        });
      }

      if (tktRes.ok) {
        const tktData = await tktRes.json();
        setTickets(tktData);
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error polling live state:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchInitial();
    const interval = setInterval(pollLiveState, 5000);
    return () => clearInterval(interval);
  }, [fetchInitial, pollLiveState]);

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update ticket status');
    }

    pollLiveState();
  };

  const handleInjectFault = async (type: string, targetId: string) => {
    const res = await fetch(`${API_BASE}/api/simulator/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, targetId })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to inject fault');
    }

    pollLiveState();
  };

  const handleOutage = async (scope: string, targetId: string) => {
    const res = await fetch(`${API_BASE}/api/simulator/outage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, targetId })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to schedule outage');
    }

    pollLiveState();
  };

  const handleRepair = async (ticketId: string) => {
    const res = await fetch(`${API_BASE}/api/simulator/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to repair fault');
    }

    pollLiveState();
  };

  const handleSeed = async () => {
    const res = await fetch(`${API_BASE}/api/simulator/seed`, {
      method: 'POST'
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to seed database');
    }

    fetchInitial();
  };

  // Stats calculation
  const totalPoles = network?.poles?.length || 0;
  const darkPolesCount = network?.poles?.filter((p: any) => p.is_energized === false).length || 0;
  const energizedRate = totalPoles > 0 ? (((totalPoles - darkPolesCount) / totalPoles) * 100).toFixed(1) : '100';
  const activeTickets = tickets.filter(t => t.status !== 'verified' && t.status !== 'closed');
  const totalDTs = network?.transformers?.length || 0;

  const healthLevel = parseFloat(energizedRate) < 50 ? 'Critical' : parseFloat(energizedRate) < 90 ? 'Low' : 'Nominal';
  const healthColor = healthLevel === 'Critical' ? 'text-cc-red' : healthLevel === 'Low' ? 'text-cc-gold' : 'text-cc-green';

  return (
    <div className="min-h-screen bg-cc-bg flex flex-col font-sans">
      {/* Top Header spanning full width */}
      <Header activeIncidents={activeTickets.length} lastRefreshed={lastRefreshed} />

      {/* Main Content Container - Full Width with Responsive Max-Width */}
      <main className="flex-1 w-full max-w-[1800px] mx-auto p-4 md:p-6 space-y-6">

        {/* ── KPI Stat Cards Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Active Incidents */}
          <div className="bg-cc-card border border-cc-border rounded p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-cc-red-bg border border-cc-red/30 rounded flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-cc-red" />
            </div>
            <div>
              <div className="text-[10px] text-cc-text-sec uppercase tracking-wider font-medium">Active Incidents</div>
              <div className="text-2xl font-extrabold text-cc-text leading-tight">{activeTickets.length}</div>
            </div>
          </div>

          {/* Grid Health Rate */}
          <div className="bg-cc-card border border-cc-border rounded p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-cc-gold-bg border border-cc-gold/30 rounded flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-cc-gold" />
            </div>
            <div>
              <div className="text-[10px] text-cc-text-sec uppercase tracking-wider font-medium">Grid Health Rate</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-cc-text leading-tight">{energizedRate}%</span>
                <span className={`text-[10px] font-bold ${healthColor}`}>{healthLevel}</span>
              </div>
            </div>
          </div>

          {/* Monitored Poles */}
          <div className="bg-cc-card border border-cc-border rounded p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-cc-green-bg border border-cc-green/30 rounded flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-cc-green" />
            </div>
            <div>
              <div className="text-[10px] text-cc-text-sec uppercase tracking-wider font-medium">Monitored Poles</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-cc-text leading-tight">{totalPoles.toLocaleString()}</span>
                <Activity className="w-3.5 h-3.5 text-cc-text-mut" />
              </div>
            </div>
          </div>

          {/* Inferred DT Topology */}
          <div className="bg-cc-card border border-cc-border rounded p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-cc-olive-bg border border-cc-olive/30 rounded flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5 text-cc-olive" />
            </div>
            <div>
              <div className="text-[10px] text-cc-text-sec uppercase tracking-wider font-medium">Inferred DT Topology</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-cc-text leading-tight">{totalDTs} DTs</span>
                <span className="text-[10px] text-cc-text-mut">(60%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Map + Fault Detail Split ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '560px' }}>
          {/* Map View */}
          <div className="lg:col-span-7 h-[560px]">
            <MapView network={network} tickets={tickets} />
          </div>

          {/* Fault Detail / Incident Cards */}
          <div className="lg:col-span-5 h-[560px] overflow-y-auto cc-scroll pr-1">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-cc-red" />
              <h2 className="text-[11px] font-bold text-cc-text-sec uppercase tracking-wider">
                Detected Fault Tickets & Workflows ({tickets.length})
              </h2>
            </div>
            <IncidentList
              tickets={tickets}
              onUpdateStatus={handleUpdateStatus}
              onRepair={handleRepair}
            />
          </div>
        </div>

        {/* ── Fault & Telemetry Simulator ── */}
        <SimulatorControls
          network={network}
          onInject={handleInjectFault}
          onOutage={handleOutage}
          onSeed={handleSeed}
        />
      </main>
    </div>
  );
}
