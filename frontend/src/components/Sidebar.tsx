'use client';

import {
  LayoutDashboard,
  Map,
  AlertTriangle,
  Activity,
  Ticket,
  FlaskConical,
  FileBarChart,
  Wrench,
  Settings,
  Zap,
  RotateCcw,
  Users,
  CheckSquare,
  ShieldAlert,
  User,
} from 'lucide-react';

const navItems = [
  { label: 'Overview',       icon: LayoutDashboard, active: true },
  { label: 'Live Map',       icon: Map },
  { label: 'Incidents',      icon: AlertTriangle },
  { label: 'Telemetry Feed', icon: Activity },
  { label: 'Tickets',        icon: Ticket },
  { label: 'Simulation',     icon: FlaskConical },
  { label: 'Reports',        icon: FileBarChart },
  { label: 'Maintenance',    icon: Wrench },
  { label: 'Settings',       icon: Settings },
];

const shortcuts = [
  { label: 'Simulate Power Restore', icon: RotateCcw, color: 'text-cc-green' },
  { label: 'Assign Field Crew',      icon: Users,     color: 'text-cc-gold' },
  { label: 'Mark Resolved',          icon: CheckSquare, color: 'text-cc-gold' },
  { label: 'Acknowledge Fault',      icon: ShieldAlert, color: 'text-cc-red' },
];

export default function Sidebar() {
  return (
    <aside className="w-[200px] min-w-[200px] bg-cc-sidebar border-r border-cc-border flex flex-col h-full select-none">
      {/* Logo / Brand */}
      <div className="px-4 py-4 border-b border-cc-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-cc-red-bg border border-cc-red/40 rounded flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-cc-red" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-extrabold text-cc-text tracking-tight">KSPDB</div>
            <div className="text-[9px] text-cc-text-sec uppercase tracking-widest leading-tight">
              Fault Detection & Localization
            </div>
            <div className="text-[9px] text-cc-gold uppercase tracking-widest font-bold">
              Command Center
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto cc-scroll">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-[12px] font-medium transition-colors ${
                item.active
                  ? 'bg-cc-olive-bg text-cc-text border-l-2 border-cc-olive'
                  : 'text-cc-text-sec hover:text-cc-text hover:bg-cc-card border-l-2 border-transparent'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Command Shortcuts */}
      <div className="px-3 py-3 border-t border-cc-border">
        <div className="text-[9px] text-cc-text-mut uppercase tracking-widest font-bold mb-2">
          Command Shortcuts
        </div>
        <div className="space-y-1">
          {shortcuts.map((sc) => {
            const Icon = sc.icon;
            return (
              <div
                key={sc.label}
                className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-cc-text-sec hover:text-cc-text hover:bg-cc-card rounded cursor-pointer transition-colors"
              >
                <Icon className={`w-3.5 h-3.5 ${sc.color} shrink-0`} />
                {sc.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Operator Info */}
      <div className="px-4 py-3 border-t border-cc-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-cc-card border border-cc-border rounded-full flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-cc-text-sec" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-cc-text">Operator 01</div>
            <div className="text-[9px] text-cc-text-mut">Control Room</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
