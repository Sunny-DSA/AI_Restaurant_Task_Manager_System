// client/src/hooks/useAuth.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest, checkinApi } from "@/lib/api"; // <-- import checkinApi

type User = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  storeId?: number | null;
};

type LoginArgs =
  | { email: string; password: string; rememberMe?: boolean }
  | { storeId: number; pin: string; rememberMe?: boolean; latitude?: number; longitude?: number };

type VerifyQRArgs = { qrData: string; latitude?: number; longitude?: number };

type QRVerifyResult = { 
  success: boolean; 
  storeId: number; 
  storeName: string; 
};

type AuthCtx = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  isVerifyingQR: boolean;
  login: (args: LoginArgs) => Promise<User>;
  verifyQR: (args: VerifyQRArgs) => Promise<QRVerifyResult>;
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
        const me = await apiRequest<User>("GET", "/api/auth/me");
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
      // apiRequest already returns parsed JSON
      const data = await apiRequest<User>("POST", "/api/auth/login", args);
      setUser(data);

      // --- auto check-in for store login ---
      if ("storeId" in args && args.storeId) {
        const coords = {
          latitude: args.latitude ?? 0,
          longitude: args.longitude ?? 0,
        };
        await checkinApi.checkInToStore(args.storeId, coords);
      }

      return data;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const verifyQR = useCallback(async (args: VerifyQRArgs): Promise<QRVerifyResult> => {
    setIsVerifyingQR(true);
    try {
      const response = await apiRequest<QRVerifyResult>("POST", "/api/auth/verify-qr", args);
      return response;
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
