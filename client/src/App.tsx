import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Tasks from "@/pages/Tasks";
import TaskLists from "@/pages/TaskLists";
import Stores from "@/pages/Stores";
import Users from "@/pages/Users";
import Reports from "@/pages/Reports";
import Login from "@/pages/Login";
import Logout from "@/pages/Logout";
import NotFound from "@/pages/not-found";

/** Protected shell: if not authenticated -> redirect to /login */
function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // While the auth state loads
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }

  // If not logged in, go to /login
  if (!isAuthenticated) {
    // Navigate away and render nothing here
    setLocation("/login", { replace: true });
    return null;
  }

  // Authenticated area
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/task" component={Tasks} />
        <Route path="/task-lists" component={TaskLists} />
        <Route path="/stores" component={Stores} />
        <Route path="/users" component={Users} />
        <Route path="/reports" component={Reports} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/logout" component={Logout} />

      {/* Everything else is protected */}
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
