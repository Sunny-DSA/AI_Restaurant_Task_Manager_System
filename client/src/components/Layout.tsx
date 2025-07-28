import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { canAccessPage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bell, Home, CheckSquare, List, Store, Users, BarChart3, Menu, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: Home, key: "dashboard" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, key: "tasks" },
  { name: "Task Lists", href: "/task-lists", icon: List, key: "tasks" },
  { name: "Stores", href: "/stores", icon: Store, key: "stores" },
  { name: "Users", href: "/users", icon: Users, key: "users" },
  { name: "Reports", href: "/reports", icon: BarChart3, key: "reports" },
];

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  const isMobile = useIsMobile();

  if (!user) {
    return <div>{children}</div>;
  }

  const filteredNavigation = navigation.filter(item => 
    canAccessPage(user.role, item.key)
  );

  const getPageTitle = () => {
    const currentPage = navigation.find(item => item.href === location);
    return currentPage?.name || "Dashboard";
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
      case "master_admin": return "bg-purple-100 text-purple-700";
      case "admin": return "bg-blue-100 text-blue-700";
      case "store_manager": return "bg-green-100 text-green-700";
      case "employee": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const MobileNavigation = () => (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around py-2">
        {filteredNavigation.slice(0, 4).map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <button className={`flex flex-col items-center py-2 px-4 ${
                isActive ? "text-primary" : "text-gray-500"
              }`}>
                <item.icon className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">{item.name}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );

  const DesktopSidebar = () => (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex flex-col min-h-0 bg-white shadow-lg">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">RestaurantTask</h1>
                <p className="text-sm text-gray-500">Task Management</p>
              </div>
            </div>
          </div>
          
          <nav className="mt-8 flex-1 px-4 space-y-2">
            {filteredNavigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <button className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}>
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </button>
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
          <div className="flex items-center w-full">
            <Avatar className="h-10 w-10">
              <AvatarFallback>{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </p>
              <Badge variant="secondary" className={`text-xs ${getRoleColor()}`}>
                {user.role.replace("_", " ")}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <DesktopSidebar />
      
      {/* Main content */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
          <div className="px-4 py-4 md:px-6">
            <div className="flex items-center justify-between">
              <div className="md:hidden">
                <h1 className="text-xl font-bold text-gray-900">RestaurantTask</h1>
              </div>
              <div className="hidden md:block">
                <h2 className="text-2xl font-bold text-gray-900">{getPageTitle()}</h2>
                <p className="text-gray-600">
                  Welcome back, {user.firstName || "User"}
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Connection status indicator */}
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`} title={isConnected ? "Connected" : "Disconnected"} />
                
                {/* Notifications */}
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    3
                  </span>
                </Button>
                
                {/* Mobile user info */}
                <div className="md:hidden">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      
      {/* Mobile navigation */}
      {isMobile && <MobileNavigation />}
    </div>
  );
}
