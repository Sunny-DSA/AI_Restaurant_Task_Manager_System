// client/src/hooks/useAuth.tsx
import React, { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type SessionUser = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  storeId?: number | null;
} | null;

type LoginBody =
  | { email: string; password: string; rememberMe?: boolean }
  | { pin: string; storeId: number; rememberMe?: boolean };

// --- tiny pass-through provider so existing imports work ---
export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => <>{children}</>;

// --- API helpers ---
async function fetchMe(): Promise<SessionUser> {
  const res = await apiRequest("GET", "/api/auth/me");
  return res.json();
}
async function postLogin(body: LoginBody): Promise<SessionUser> {
  const res = await apiRequest("POST", "/api/auth/login", body);
  return res.json();
}
async function postLogout(): Promise<void> {
  await apiRequest("POST", "/api/auth/logout");
}

// optional QR helper
async function verifyQrServerFirst(qrData: string): Promise<{ storeId?: number; storeName?: string }> {
  try {
    const res = await apiRequest("POST", "/api/auth/verify-qr", { qrData });
    return res.json();
  } catch (err: any) {
    try {
      const parsed = JSON.parse(qrData);
      if (parsed && typeof parsed.storeId === "number") {
        return { storeId: parsed.storeId, storeName: parsed.storeName };
      }
    } catch {}
    throw err;
  }
}

export function useAuth() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, isError } = useQuery<SessionUser>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchMe,
    retry: false,
    select: (u) => u ?? null,
  });

  const isAuthenticated = useMemo(() => !!user, [user]);

  const loginMutation = useMutation({
    mutationFn: (body: LoginBody) => postLogin(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/", { replace: true });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => postLogout(),
    onSuccess: async () => {
      queryClient.setQueryData<SessionUser>(["/api/auth/me"], null);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login", { replace: true });
    },
  });

  const verifyQrMutation = useMutation({
    mutationFn: (qrData: string) => verifyQrServerFirst(qrData),
  });

  const login = useCallback(async (body: LoginBody) => {
    await loginMutation.mutateAsync(body);
  }, [loginMutation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const verifyQR = useCallback(async ({ qrData }: { qrData: string }) => {
    return await verifyQrMutation.mutateAsync(qrData);
  }, [verifyQrMutation]);

  return {
    user,
    isAuthenticated,
    isLoading: isLoading && !isError,
    // login/logout
    login,
    isLoggingIn: loginMutation.isPending,
    logout,
    isLoggingOut: logoutMutation.isPending,
    // optional QR
    verifyQR,
    isVerifyingQR: verifyQrMutation.isPending,
  };
}
