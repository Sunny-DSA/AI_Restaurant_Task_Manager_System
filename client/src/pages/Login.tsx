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
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { QrReader } from "react-qr-reader";
import axios from "axios";

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
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, isLoggingIn, verifyQR, isVerifyingQR } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("admin");

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    const savedTab = localStorage.getItem("rememberedTab");

    if (savedTab === "admin") {
      setTab("admin");
      if (savedEmail) setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await login({ email, password });
      
      // Handle remember me functionality
      if (tab === "admin" && rememberMe) {
        localStorage.setItem("rememberedEmail", email);
        localStorage.setItem("rememberedTab", "admin");
      } else {
        localStorage.removeItem("rememberedEmail");
        localStorage.removeItem("rememberedTab");
      }
      
      // Navigation will happen automatically due to authentication state change
    } catch (err: any) {
      // Error handling is already done in the useAuth hook
      console.log("Login error:", err);
    }
  };

  const handleQRLogin = async (scannedCode: string) => {
    try {
      await verifyQR({ qrData: scannedCode });
      // Navigation will happen automatically due to authentication state change
    } catch (err: any) {
      toast({
        title: "QR Login Failed",
        description: err.message || "Invalid QR code or store not found.",
        variant: "destructive",
      });
    } finally {
      setShowQRScanner(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300 px-4 relative">
      <ThemeToggle />
      <div className="max-w-md w-full space-y-6">
        {/* Logo & Title */}
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

          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={setTab}>
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
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="storeId">Store ID</Label>
                  <Input
                    id="storeId"
                    placeholder="Enter Store ID"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    placeholder="Enter Employee ID"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

            <Button onClick={handleLogin} className="w-full" disabled={isLoggingIn}>
              {isLoggingIn ? "Logging in..." : (
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
                >
                  <QrCode className="w-5 h-5 mr-2" />
                  Scan Store QR Code
                </Button>

                {showQRScanner && (
                  <div className="mt-4 border rounded-md overflow-hidden">
                    <QrReader
                      constraints={{ facingMode: "environment" }}
                      onResult={(result) => {
                        if (!!result) {
                          handleQRLogin(result.getText());
                        }
                      }}
                      containerStyle={{ width: "100%" }}
                    />
                  </div>
                )}
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
