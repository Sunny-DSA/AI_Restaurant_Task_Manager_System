// client/src/App.tsx
import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import TaskListRunPage from "@/pages/TaskListRunPage";
import TaskListsPage from "@/pages/TaskListsPage"; // NEW
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
import PhotoFeed from "@/pages/PhotoFeed";
import { canAccessPage } from "@/lib/auth";

/** Guard a single page by role; redirect home if unauthorized. */
function RequirePage({
  page,
  children,
}: {
  page: string;
  children: JSX.Element;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const role = user?.role || "employee";
  const allowed = canAccessPage(role, page);

  useEffect(() => {
    if (!allowed) setLocation("/", { replace: true });
  }, [allowed, setLocation]);

  return allowed ? children : null;
}

/** Protected shell: if not authenticated -> redirect to /login */
function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/login", { replace: true });
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/task" component={Tasks} />
        <Route path="/task-lists" component={TaskLists} />
        <Route path="/tasklists" component={TaskListsPage} />
        <Route path="/tasklists/run/:id" component={TaskListRunPage} />

        {/* Admin-only routes guarded by RequirePage */}
        <Route
          path="/stores"
          component={() => (
            <RequirePage page="stores">
              <Stores />
            </RequirePage>
          )}
        />
        <Route
          path="/users"
          component={() => (
            <RequirePage page="users">
              <Users />
            </RequirePage>
          )}
        />
        <Route
          path="/reports"
          component={() => (
            <RequirePage page="reports">
              <Reports />
            </RequirePage>
          )}
        />

        {/* Example for an admin utility page */}
        <Route
          path="/admin/photos"
          component={() => (
            <RequirePage page="admin">
              <PhotoFeed />
            </RequirePage>
          )}
        />

        {/* Fallback must be LAST */}
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
      {/* Everything else protected */}
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
