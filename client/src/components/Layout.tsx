import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { canAccessPage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Home,
  CheckSquare,
  List,
  Store,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import ThemeToggle from "@/components/ThemeToggle";
import CheckinControl from "@/components/CheckinControl";
import UserMenu from "@/components/UserMenu";

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, key: "dashboard" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, key: "tasks" },
  { name: "Task Lists", href: "/task-lists", icon: List, key: "task_lists" },
  { name: "Stores", href: "/stores", icon: Store, key: "stores" },
  { name: "Users", href: "/users", icon: Users, key: "users" },
  { name: "Reports", href: "/reports", icon: BarChart3, key: "reports" },
];

const extraTitles: Record<string, string> = {
  "/admin/photos": "Photo Feed",
};

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { isConnected } = useWebSocket();
  const isMobile = useIsMobile();
  const [showThemeToggle, setShowThemeToggle] = useState(false);

  if (!user) {
    return <div>{children}</div>;
  }

  const filteredNavigation = navigation.filter((item) =>
    canAccessPage(user.role, item.key),
  );

  const getPageTitle = () => {
    const currentPage = navigation.find((item) => item.href === location);
    if (currentPage?.name) return currentPage.name;
    if (extraTitles[location]) return extraTitles[location];
    return "Dashboard";
  };

  const getUserInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  const getRoleColor = () => {
    switch (user.role) {
      case "master_admin":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "admin":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "store_manager":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "employee":
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const isAdmin = user.role === "admin" || user.role === "master_admin";
  const isEmployeeOrManager =
    user.role === "employee" || user.role === "store_manager";

  const mobileNav = [
    ...filteredNavigation,
    ...(isAdmin
      ? ([
          {
            name: "Photo Feed",
            href: "/admin/photos",
            icon: List,
            key: "photo-feed",
          } as const,
        ] as const)
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex flex-col min-h-0 bg-white dark:bg-gray-950 shadow-lg">
          {/* App name/logo */}
          <div className="flex items-center px-4 py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  RestaurantTask
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Task Management
                </p>
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="mt-8 flex-1 px-4 space-y-2">
            {filteredNavigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <button
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                    }`}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </button>
                </Link>
              );
            })}

            {/* Admin-only: Photo Feed */}
            {isAdmin && (
              <Link href="/admin/photos">
                <button
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                    location === "/admin/photos"
                      ? "bg-primary/10 text-primary"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <List className="mr-3 h-5 w-5" />
                  Photo Feed
                </button>
              </Link>
            )}
          </nav>

          {/* User footer (desktop) — removed inline logout button */}
          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center w-full">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium">
                  {user.firstName} {user.lastName}
                </p>
                {user?.role && (
                  <Badge
                    variant="secondary"
                    className={`text-xs ${getRoleColor()}`}
                  >
                    {user.role.replace("_", " ")}
                  </Badge>
                )}
              </div>
              {/* Keep the space clean; logout lives in the top user menu */}
              <Link href="/settings">
                <Button variant="ghost" size="sm" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        <header className="bg-white dark:bg-gray-950 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
          <div className="px-4 py-4 md:px-6 flex items-center justify-between">
            <div className="hidden md:block">
              <h2 className="text-2xl font-bold">{getPageTitle()}</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Welcome back, {user.firstName || "User"}
              </p>
            </div>

            <div className="flex items-center space-x-2 md:space-x-4">
              {/* WebSocket status */}
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
                title={isConnected ? "Connected" : "Disconnected"}
              />

              {/* Check-in pill (employees/managers only) */}
              {isEmployeeOrManager && <CheckinControl />}

              {/* Settings / theme */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowThemeToggle(!showThemeToggle)}
                aria-label="Theme"
              >
                <Settings className="h-5 w-5" />
              </Button>
              {showThemeToggle && <ThemeToggle />}

              {/* Notifications */}
              <Button
                variant="ghost"
                size="sm"
                className="relative"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  3
                </span>
              </Button>

              {/* User menu (works on mobile + desktop) */}
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50">
          <div className="flex gap-2 px-2 py-2 overflow-x-auto no-scrollbar">
            {mobileNav.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex flex-col items-center min-w-[72px] px-3 py-1.5 rounded-md ${
                      isActive
                        ? "text-primary"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <item.icon className="h-5 w-5 mb-1" />
                    <span className="text-xs font-medium truncate">
                      {item.name}
                    </span>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
