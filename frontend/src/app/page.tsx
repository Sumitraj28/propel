'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import IncidentList from '../components/IncidentList';
import SimulatorControls from '../components/SimulatorControls';
import { Activity, Zap, ShieldCheck, AlertCircle, RefreshCw, Radio } from 'lucide-react';

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
    const interval = setInterval(pollLiveState, 5000); // 5s live polling loop
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
  const unknownTopologyDTs = network?.transformers?.filter((d: any) => !d.isKnownTopology).length || 0;

  return (
    <main className="min-h-screen p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Top Header & Stats */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-xl">
            <Zap className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              KSPDB Fault Detection & Localization Command Center
            </h1>
            <p className="text-xs text-slate-400">
              Karnataka State Power Distribution Board • Operator Dispatch Console (Real-time Telemetry Graph Analysis)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            Polling live (5s) • {lastRefreshed.toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-red-950/60 border border-red-800/60 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Active Incidents</span>
            <span className="text-2xl font-black text-white">{activeTickets.length}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Grid Health Rate</span>
            <span className="text-2xl font-black text-emerald-400">{energizedRate}%</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/60 border border-blue-800/60 rounded-lg text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Monitored Poles</span>
            <span className="text-2xl font-black text-white">{totalPoles}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/60 border border-amber-800/60 rounded-lg text-amber-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Inferred DT Topology (60%)</span>
            <span className="text-2xl font-black text-amber-400">{unknownTopologyDTs} DTs</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Map View, Right Incident List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[680px]">
        <div className="lg:col-span-7 h-full">
          <MapView network={network} tickets={tickets} />
        </div>

        <div className="lg:col-span-5 h-full overflow-y-auto pr-1">
          <h2 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Detected Fault Tickets & Workflows ({tickets.length})
          </h2>
          <IncidentList
            tickets={tickets}
            onUpdateStatus={handleUpdateStatus}
            onRepair={handleRepair}
          />
        </div>
      </div>

      {/* Fault Simulator Controls */}
      <SimulatorControls
        network={network}
        onInject={handleInjectFault}
        onOutage={handleOutage}
        onSeed={handleSeed}
      />
    </main>
  );
}
