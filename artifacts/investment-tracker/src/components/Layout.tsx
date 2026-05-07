import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Briefcase, TrendingUp, List, Upload, Download,
  PieChart, BarChart3, Wallet, Settings, ChevronRight, Calculator
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/portfolios', label: 'Portfolios', icon: Briefcase },
  { path: '/holdings', label: 'Holdings', icon: TrendingUp },
  { path: '/transactions', label: 'Transactions', icon: List },
  { path: '/import', label: 'Import CSV', icon: Upload },
  { path: '/export', label: 'Export CSV', icon: Download },
  { path: '/distributions', label: 'Distributions', icon: PieChart },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/contributions', label: 'Contributions', icon: Wallet },
  { path: '/sell-calculator', label: 'Sell Calculator', icon: Calculator },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
        <div className="px-5 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <span className="text-sidebar-foreground font-semibold text-base tracking-tight">Folio</span>
          </div>
          <p className="text-sidebar-foreground/50 text-xs mt-1">Investment Tracker</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = path === '/' ? location === '/' : location.startsWith(path);
            return (
              <Link
                key={path}
                href={path}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors group',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="h-3 w-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-sidebar-foreground/30 text-xs">All data stored locally</p>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
