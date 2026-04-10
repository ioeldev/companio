import type { ReactNode } from "react";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface NavBarProps {
  items: NavItem[];
  current: string;
  onNavigate: (id: string) => void;
  /** extra button rendered after the nav items (e.g. API Tester toggle) */
  extra?: ReactNode;
}

/** Desktop sidebar nav — hidden on mobile */
export function SidebarNav({ items, current, onNavigate, extra }: NavBarProps) {
  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 bg-white/[0.03] border-r border-white/10">
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="font-bold text-lg tracking-tight">Companio</h1>
        <p className="text-xs text-white/30 mt-0.5">Dashboard</p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              current === item.id
                ? "bg-white/10 text-white"
                : "text-white/50 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {extra && (
        <div className="px-2 pb-3 border-t border-white/10 pt-3">{extra}</div>
      )}
    </aside>
  );
}

/** Mobile bottom tab bar — hidden on desktop */
export function BottomNav({ items, current, onNavigate }: NavBarProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 flex bg-[#111] border-t border-white/10 z-20">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
            current === item.id ? "text-white" : "text-white/40"
          }`}
        >
          {item.icon}
          <span className="text-[10px] font-medium">{item.label.slice(0, 5)}</span>
        </button>
      ))}
    </nav>
  );
}
