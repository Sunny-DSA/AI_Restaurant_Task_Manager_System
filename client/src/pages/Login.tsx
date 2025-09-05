import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, Store, Eye, EyeOff, QrCode } from "lucide-react";
import QRScanner from "@/components/QRScanner";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const { login, isLoggingIn, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [tab, setTab] = useState<"store" | "admin">("store");

  // Admin creds
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(true);

  // Store/Employee creds
  const [storeId, setStoreId] = useState("");
  const [pin, setPin] = useState("");
  const [rememberStore, setRememberStore] = useState(true);
  const [showQR, setShowQR] = useState(false);

  // Redirect after successful auth
  useEffect(() => {
    if (isAuthenticated) setLocation("/"); // Dashboard is at "/"
  }, [isAuthenticated, setLocation]);

  // Clear unrelated fields when switching tabs
  useEffect(() => {
    if (tab === "admin") {
      setStoreId("");
      setPin("");
    } else {
      setEmail("");
      setPassword("");
    }
  }, [tab]);

  // --- Error sanitizer: always show a friendly sentence in the toast ---
  const friendly = (err: unknown, fallback = "Login failed. Please try again.") => {
    const raw =
      err && typeof err === "object" && "message" in err
        ? String((err as any).message)
        : String(err ?? "");
    // If it looks like: `401 Unauthorized: {"message":"..."}`
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        if (obj && typeof obj.message === "string" && obj.message.trim()) {
          return obj.message;
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    // Strip leading "### Word:" status prefixes if present
    const stripped = raw.replace(/^\s*\d{3}\s+[A-Za-z ]+:\s*/, "").trim();
    if (stripped) return stripped;
    return fallback;
  };

  const showError = (e: unknown, title = "Login failed") =>
    toast({ title, description: friendly(e), variant: "destructive" });

  const handleSubmit = useCallback(async () => {
    try {
      if (tab === "admin") {
        if (!email || !password) {
          return toast({
            title: "Missing fields",
            description: "Please enter both email and password.",
            variant: "destructive",
          });
        }
        await login({ email, password, rememberMe: rememberAdmin });
      } else {
        if (!storeId || !pin) {
          return toast({
            title: "Missing fields",
            description: "Please enter both Store ID and PIN.",
            variant: "destructive",
          });
        }

        // Try to send geolocation so server can enforce fence
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              try {
                await login({
                  storeId: Number(storeId),
                  pin,
                  rememberMe: rememberStore,
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
              } catch (e) {
                showError(e);
              }
            },
            async () => {
              try {
                await login({ storeId: Number(storeId), pin, rememberMe: rememberStore });
              } catch (e) {
                showError(e);
              }
            }
          );
          return; // prevent double submit fall-through
        }

        await login({ storeId: Number(storeId), pin, rememberMe: rememberStore });
      }
    } catch (e) {
      showError(e);
    }
  }, [tab, email, password, rememberAdmin, storeId, pin, rememberStore, login, toast]);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background">
      {/* Dark mode toggle on top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" /> Login
            </CardTitle>
            <CardDescription>Choose your login type</CardDescription>
          </CardHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <CardContent className="space-y-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
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
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-2 flex items-center"
                        onClick={() => setShowPw((s) => !s)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={rememberAdmin} onChange={(e) => setRememberAdmin(e.target.checked)} />
                    Remember me
                  </label>
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

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={rememberStore} onChange={(e) => setRememberStore(e.target.checked)} />
                      Remember me
                    </label>
                    <Button type="button" variant="outline" onClick={() => setShowQR(true)}>
                      <QrCode className="w-4 h-4 mr-2" />
                      Scan QR
                    </Button>
                  </div>

                  <QRScanner
                    isOpen={showQR}
                    onClose={() => setShowQR(false)}
                    onSuccess={(scannedStoreId) => setStoreId(String(scannedStoreId))}
                  />
                </>
              )}
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging in..." : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Login
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
