import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function Logout() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await logout();
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLocation("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="text-sm text-gray-500">Signing you out…</p>
      </div>
    </div>
  );
}
