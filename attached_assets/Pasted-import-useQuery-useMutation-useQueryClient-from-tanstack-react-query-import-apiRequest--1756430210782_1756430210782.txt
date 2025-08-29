import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  storeId?: number;
}

interface LoginData {
  email?: string;
  password?: string;
  pin?: string;
  storeId?: number;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null; // unauthenticated
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    enabled: true,
  });

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginData): Promise<{ success: boolean; user: User }> => {
      const response = await apiRequest("POST", "/api/auth/login", loginData);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (response) => {
      const loggedInUser = response.user;
      queryClient.setQueryData(["/api/auth/me"], loggedInUser);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${loggedInUser.firstName ?? ""} ${loggedInUser.lastName ?? ""}`.trim(),
      });
    },
    onError: (error: any) => {
      const fallbackMessage = "An unexpected error occurred. Please try again.";
      let message = fallbackMessage;
      try {
        const parsed = JSON.parse(error.message);
        message = parsed?.message || fallbackMessage;
      } catch {
        if (typeof error?.message === "string" && error.message.includes("401")) {
          message = "Invalid email or password. Please check your credentials.";
        }
      }
      toast({ title: "Login failed", description: message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      if (!res.ok && res.status !== 401) throw new Error(await res.text());
      return true;
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      localStorage.removeItem("rememberedEmail");
      localStorage.removeItem("rememberedTab");
      toast({ title: "Logged out", description: "You have been logged out successfully" });
    },
  });

  const verifyQRMutation = useMutation({
    mutationFn: async (data: { qrData: string; latitude?: number; longitude?: number }) => {
      const response = await apiRequest("POST", "/api/auth/verify-qr", data);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (data: { storeId: number; latitude?: number; longitude?: number }) => {
      const response = await apiRequest("POST", "/api/auth/checkin", data);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Checked in successfully", description: "You can now access your tasks" });
    },
    onError: (error: Error) => {
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/checkout");
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Checked out", description: "Have a great day!" });
    },
  });

  return {
    user: user as User | null,
    isLoading,
    isAuthenticated: !!user && !error,

    // Expose async methods so pages can await them
    login: (data: LoginData) => loginMutation.mutateAsync(data),
    logout: () => logoutMutation.mutateAsync(),
    verifyQR: (p: { qrData: string; latitude?: number; longitude?: number }) =>
      verifyQRMutation.mutateAsync(p),
    checkIn: (p: { storeId: number; latitude?: number; longitude?: number }) =>
      checkInMutation.mutateAsync(p),
    checkOut: () => checkOutMutation.mutateAsync(),

    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    isVerifyingQR: verifyQRMutation.isPending,
    isCheckingIn: checkInMutation.isPending,
    isCheckingOut: checkOutMutation.isPending,
    qrResult: verifyQRMutation.data,
    qrError: verifyQRMutation.error,
  };
}
