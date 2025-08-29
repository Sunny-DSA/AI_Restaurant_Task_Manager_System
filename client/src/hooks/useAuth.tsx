// client/src/hooks/useAuth.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type User = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  storeId?: number | null;
};

type LoginArgs =
  | { email: string; password: string } // admin
  | { storeId: number; pin: string };   // store employee

type VerifyQRArgs = { qrData: string };

type AuthCtx = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  isVerifyingQR: boolean;
  login: (args: LoginArgs) => Promise<void>;
  verifyQR: (args: VerifyQRArgs) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isVerifyingQR, setIsVerifyingQR] = useState(false);

  // bootstrap session
  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/auth/me");
        const me = (await res.json()) as User;
        setUser(me);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (args: LoginArgs) => {
    setIsLoggingIn(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", args);
      const me = (await res.json()) as User;
      setUser(me);
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const verifyQR = useCallback(async (args: VerifyQRArgs) => {
    setIsVerifyingQR(true);
    try {
      await apiRequest("POST", "/api/auth/verify-qr", args);
      // no state change by default; your Login page may parse storeId from QR
    } finally {
      setIsVerifyingQR(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isLoggingIn,
        isVerifyingQR,
        login,
        verifyQR,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}
