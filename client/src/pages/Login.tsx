"use client";

import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Store, QrCode, LogIn, Sun, Moon } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import QrScanner from "react-qr-barcode-scanner";
import type { Result } from "@zxing/library";

function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="absolute top-4 right-4 text-gray-500 dark:text-yellow-300"
      aria-label="Toggle Dark Mode"
    >
      {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

export default function LoginPage() {
  const { toast } = useToast();
  const { login, isLoggingIn, verifyQR, isVerifyingQR } = useAuth();

  // Which tab is selected
  const [tab, setTab] = useState<"admin" | "store">("admin");

  // Admin fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Store/employee fields
  const [storeId, setStoreId] = useState("");
  const [employeePin, setEmployeePin] = useState("");

  // QR
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Load remembered admin email (if any)
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    const savedTab = localStorage.getItem("rememberedTab");
    if (savedTab === "admin") {
      setTab("admin");
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }
  }, []);

  // Clear/re-init fields when switching tabs
  useEffect(() => {
    if (tab === "admin") {
      setPassword("");
      setShowQRScanner(false);
    } else {
      setStoreId("");
      setEmployeePin("");
      setShowQRScanner(false);
      setRememberMe(false);
    }
  }, [tab]);

  const handleLogin = useCallback(async () => {
    try {
      if (tab === "admin") {
        await login({ email, password });

        if (rememberMe) {
          localStorage.setItem("rememberedEmail", email);
          localStorage.setItem("rememberedTab", "admin");
        } else {
          localStorage.removeItem("rememberedEmail");
          localStorage.removeItem("rememberedTab");
        }
      } else {
        const sid = Number(storeId);
        if (!sid || !employeePin) {
          toast({
            title: "Missing fields",
            description: "Please enter both Store ID and Employee PIN.",
            variant: "destructive",
          });
          return;
        }
        await login({ storeId: sid, pin: employeePin });
      }
    } catch {
      // handled by useAuth onError toast
    }
  }, [tab, email, password, rememberMe, storeId, employeePin, login, toast]);

  const handleQRLogin = useCallback(
    async (scannedText: string) => {
      try {
        await verifyQR({ qrData: scannedText });
        // Optional: auto-fill storeId if QR is JSON with { storeId }
        try {
          const payload = JSON.parse(scannedText);
          if (payload?.storeId) setStoreId(String(payload.storeId));
        } catch {
          // non-JSON QR is fine; server has already validated
        }
      } catch (err: any) {
        toast({
          title: "QR Login Failed",
          description: err?.message || "Invalid QR code or store not found.",
          variant: "destructive",
        });
      } finally {
        setShowQRScanner(false);
      }
    },
    [verifyQR, toast]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300 px-4 relative">
      <ThemeToggle />
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
            <Store className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold">RestaurantTask</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Task Management System
          </p>
        </div>

        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md">
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Login to manage restaurant operations</CardDescription>
          </CardHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <CardContent className="space-y-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "admin" | "store")}>
                <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700">
                  <TabsTrigger value="store">Store Login</TabsTrigger>
                  <TabsTrigger value="admin">Admin Login</TabsTrigger>
                </TabsList>
              </Tabs>

              {tab === "admin" ? (
                <>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@restaurant.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="storeId">Store ID</Label>
                    <Input
                      id="storeId"
                      placeholder="Enter Store ID"
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>

                  <div>
                    <Label htmlFor="employeePin">Employee PIN</Label>
                    <Input
                      id="employeePin"
                      placeholder="Enter 4-digit PIN"
                      value={employeePin}
                      onChange={(e) => setEmployeePin(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </>
              )}
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              {tab === "admin" && (
                <div className="flex items-center justify-between w-full text-sm">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="form-checkbox"
                    />
                    <span>Remember me</span>
                  </label>
                  <a href="#" className="text-blue-500 hover:underline">
                    Forgot Password?
                  </a>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2 text-white" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3.5-3.5L12 0v4a8 8 0 010 16v4l3.5-3.5L12 20v-4a8 8 0 01-8-8z"
                      />
                    </svg>
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Login as {tab === "admin" ? "Admin" : "Store"}
                  </>
                )}
              </Button>

              {tab === "store" && (
                <>
                  <Button
                    onClick={() => setShowQRScanner(true)}
                    className="w-full"
                    variant="outline"
                    type="button"
                    disabled={isVerifyingQR}
                  >
                    <QrCode className="w-5 h-5 mr-2" />
                    {isVerifyingQR ? "Verifying..." : "Scan Store QR Code"}
                  </Button>

                  {showQRScanner && (
                    <div className="mt-4 border rounded-md overflow-hidden">
                      <QrScanner
                        onUpdate={(_err: unknown, result?: Result) => {
                          const text = result?.getText();
                          if (text) {
                            handleQRLogin(text);
                          }
                        }}
                        constraints={{ facingMode: "environment" }}
                      />
                    </div>
                  )}
                </>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
