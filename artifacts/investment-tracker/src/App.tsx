import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect } from 'react';
import Layout from '@/components/Layout';
import { seedData } from '@/lib/seedData';
import Dashboard from '@/pages/Dashboard';
import Portfolios from '@/pages/Portfolios';
import Holdings from '@/pages/Holdings';
import Transactions from '@/pages/Transactions';
import ImportPage from '@/pages/Import';
import ExportPage from '@/pages/Export';
import Distributions from '@/pages/Distributions';
import Reports from '@/pages/Reports';
import Contributions from '@/pages/Contributions';
import SettingsPage from '@/pages/Settings';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function AppRoutes() {
  useEffect(() => {
    seedData().catch(console.error);
  }, []);

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/portfolios" component={Portfolios} />
        <Route path="/holdings" component={Holdings} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/import" component={ImportPage} />
        <Route path="/export" component={ExportPage} />
        <Route path="/distributions" component={Distributions} />
        <Route path="/reports" component={Reports} />
        <Route path="/contributions" component={Contributions} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
