"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast"; // Adjust path if needed
import { Store, QrCode, LogIn, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { QrReader } from "react-qr-reader";
import axios from "axios";

function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );

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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("admin");

  const [loading, setLoading] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/login", { email, password }, {
        withCredentials: true
      });

      if (res.data.success) {
        setLocation("/");
      } else {
        throw new Error(res.data.message || "Login failed");
      }
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err.response?.data?.message || "Invalid email or password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQRLogin = async (scannedCode: string) => {
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/verify-qr", { qrData: scannedCode }, {
        withCredentials: true
      });

      if (res.data.success) {
        setLocation("/");
      } else {
        throw new Error(res.data.message || "QR verification failed");
      }
    } catch (err: any) {
      toast({
        title: "QR Login Failed",
        description: err.response?.data?.message || "Invalid QR code or store not found.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              onClick={handleLogin}
              className="w-full"
              disabled={loading}
            >
              {loading ? "Logging in..." : (
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
