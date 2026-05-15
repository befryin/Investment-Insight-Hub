import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Briefcase, TrendingUp, List, Upload, Download,
  PieChart, BarChart3, Wallet, Settings, ChevronRight, Calculator,
  Landmark, ReceiptText, Tags
} from 'lucide-react';
import { cn } from '@/lib/utils';

const OVERVIEW_NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
];

const INVESTMENT_NAV_ITEMS = [
  { path: '/investments', label: 'Dashboard', icon: TrendingUp },
  { path: '/portfolios', label: 'Portfolios', icon: Briefcase },
  { path: '/holdings', label: 'Holdings', icon: TrendingUp },
  { path: '/transactions', label: 'Transactions', icon: List },
  { path: '/distributions', label: 'Distributions', icon: PieChart },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/contributions', label: 'Contributions', icon: Wallet },
  { path: '/sell-calculator', label: 'Sell Calculator', icon: Calculator },
];

const FINANCE_NAV_ITEMS = [
  { path: '/banking', label: 'Bank Accounts', icon: Landmark },
  { path: '/ledger', label: 'Ledger', icon: ReceiptText },
  { path: '/categories', label: 'Categories', icon: Tags },
  { path: '/expense-reports', label: 'Spending Reports', icon: PieChart },
];

const TOOLS_NAV_ITEMS = [
  { path: '/import-expenses', label: 'Import Expenses', icon: Upload },
  { path: '/export-expenses', label: 'Export Expenses', icon: Download },
  { path: '/import', label: 'Import Investments', icon: Upload },
  { path: '/export', label: 'Export Investments', icon: Download },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
        <div className="px-5 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">W</span>
            </div>
            <span className="text-sidebar-foreground font-semibold text-base tracking-tight">WealthHub</span>
          </div>
          <p className="text-sidebar-foreground/50 text-xs mt-1">Investments & Expenses</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">WealthHub</div>
            <div className="space-y-0.5">
              {OVERVIEW_NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const active = location === '/';
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
            </div>
          </div>
          
          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Investments</div>
            <div className="space-y-0.5">
              {INVESTMENT_NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const active = location.startsWith(path);
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
            </div>
          </div>
          
          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Everyday Finances</div>
            <div className="space-y-0.5">
              {FINANCE_NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const active = location.startsWith(path);
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
            </div>
          </div>

          <div>
            <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Tools</div>
            <div className="space-y-0.5">
              {TOOLS_NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                const active = location.startsWith(path);
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
            </div>
          </div>
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
