'use client';

import { useEffect, useState } from 'react';
import { Bell, Shield, Zap } from 'lucide-react';

interface HeaderProps {
  activeIncidents: number;
  lastRefreshed: Date;
}

export default function Header({ activeIncidents, lastRefreshed }: HeaderProps) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-IN', { hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 min-h-[56px] bg-cc-card border-b border-cc-border flex items-center justify-between px-6 select-none">
      {/* Brand Title Block (Left Aligned) */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-cc-red-bg border border-cc-red/40 rounded flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-cc-red" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-black tracking-tight text-cc-text">KSPDB</span>
          <span className="text-xs font-semibold text-cc-text-sec uppercase tracking-wider hidden sm:inline">
            Fault Detection & Localization Command Center
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <div className="relative cursor-pointer">
          <Bell className="w-4 h-4 text-cc-text-sec" />
          {activeIncidents > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cc-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {activeIncidents}
            </span>
          )}
        </div>

        {/* System Health */}
        <div className="flex items-center gap-1.5 bg-cc-inner border border-cc-border rounded px-2.5 py-1">
          <Shield className="w-3 h-3 text-cc-green" />
          <span className="text-[11px] text-cc-text-sec font-medium">System Healthy</span>
        </div>

        {/* Live Clock */}
        <div className="text-right">
          <div className="text-[13px] font-mono font-bold text-cc-text leading-none">{clock}</div>
          <div className="flex items-center gap-1 justify-end">
            <span className="w-1.5 h-1.5 bg-cc-green rounded-full cc-dot-pulse" />
            <span className="text-[9px] text-cc-text-mut uppercase tracking-wider">Live Polling</span>
          </div>
        </div>
      </div>
    </header>
  );
}
