"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, Store } from "lucide-react";

export default function LoginPage() {
  const { login, isLoggingIn, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"admin" | "store">("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [pin, setPin] = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/", { replace: true });
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (tab === "admin") {
      setStoreId("");
      setPin("");
    } else {
      setEmail("");
      setPassword("");
    }
  }, [tab]);

  const handleSubmit = useCallback(async () => {
    try {
      if (tab === "admin") {
        if (!email || !password) {
          toast({
            title: "Missing Credentials",
            description: "Please enter both email and password",
            variant: "destructive",
          });
          return;
        }
        await login({ email, password });
        // Navigation will happen automatically via useEffect when isAuthenticated changes
        toast({
          title: "Login Successful",
          description: "Welcome back!",
        });
      } else {
        const sid = Number(storeId);
        if (!sid || !pin) {
          toast({
            title: "Missing Credentials",
            description: "Please enter both Store ID and PIN",
            variant: "destructive",
          });
          return;
        }
        await login({ storeId: sid, pin });
        toast({
          title: "Login Successful",
          description: "Welcome back!",
        });
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    }
  }, [tab, email, password, storeId, pin, login, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
            <Store className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold">RestaurantTask</h1>
          <p className="text-gray-500 text-sm">Task Management System</p>
        </div>

        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Login to continue</CardDescription>
          </CardHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <CardContent className="space-y-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2 bg-gray-100">
                  <TabsTrigger value="store">Store Login</TabsTrigger>
                  <TabsTrigger value="admin">Admin Login</TabsTrigger>
                </TabsList>
              </Tabs>

              {tab === "admin" ? (
                <>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="storeId">Store ID</Label>
                    <Input id="storeId" value={storeId} onChange={(e) => setStoreId(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <Label htmlFor="pin">Employee PIN</Label>
                    <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
                  </div>
                </>
              )}
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging in..." : <><LogIn className="w-4 h-4 mr-2" />Login</>}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
