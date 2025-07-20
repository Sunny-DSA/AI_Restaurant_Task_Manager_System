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
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      
      // Return null for 401 (unauthenticated) instead of throwing
      if (res.status === 401) {
        return null;
      }
      
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity, // Never consider stale
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: false,
    enabled: true
  });

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginData) => {
      const response = await apiRequest("POST", "/api/auth/login", loginData);
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.firstName} ${user.lastName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
  });

  const verifyQRMutation = useMutation({
    mutationFn: async (data: { qrData: string; latitude?: number; longitude?: number }) => {
      const response = await apiRequest("POST", "/api/auth/verify-qr", data);
      return response.json();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (data: { storeId: number; latitude?: number; longitude?: number }) => {
      const response = await apiRequest("POST", "/api/auth/checkin", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Checked in successfully",
        description: "You can now access your tasks",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Check-in failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/checkout");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Checked out",
        description: "Have a great day!",
      });
    },
  });

  return {
    user: user as User | null,
    isLoading,
    isAuthenticated: !!user && !error,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    verifyQR: verifyQRMutation.mutate,
    checkIn: checkInMutation.mutate,
    checkOut: checkOutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    isVerifyingQR: verifyQRMutation.isPending,
    isCheckingIn: checkInMutation.isPending,
    isCheckingOut: checkOutMutation.isPending,
    qrResult: verifyQRMutation.data,
    qrError: verifyQRMutation.error,
  };
}
