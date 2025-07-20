import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import QRScanner from "@/components/QRScanner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Store, 
  QrCode, 
  Mail, 
  Lock, 
  Hash, 
  MapPin,
  CheckCircle,
  AlertCircle
} from "lucide-react";

const emailLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const pinLoginSchema = z.object({
  pin: z.string().length(4, "PIN must be exactly 4 digits").regex(/^\d+$/, "PIN must contain only numbers"),
  storeId: z.number().min(1, "Please select a store or scan QR code"),
});

type EmailLoginData = z.infer<typeof emailLoginSchema>;
type PinLoginData = z.infer<typeof pinLoginSchema>;

export default function Login() {
  const [activeTab, setActiveTab] = useState("pin");
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [selectedStore, setSelectedStore] = useState<{ id: number; name: string } | null>(null);
  const { 
    login, 
    isLoggingIn, 
    verifyQR, 
    isVerifyingQR, 
    qrResult, 
    checkIn, 
    isCheckingIn 
  } = useAuth();

  const emailForm = useForm<EmailLoginData>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const pinForm = useForm<PinLoginData>({
    resolver: zodResolver(pinLoginSchema),
    defaultValues: {
      pin: "",
      storeId: selectedStore?.id || 0,
    },
  });

  const onEmailSubmit = (data: EmailLoginData) => {
    login(data);
  };

  const onPinSubmit = (data: PinLoginData) => {
    login({
      pin: data.pin,
      storeId: data.storeId,
    });
  };

  const handleQRSuccess = (storeId: number, storeName: string) => {
    setSelectedStore({ id: storeId, name: storeName });
    pinForm.setValue("storeId", storeId);
    setShowQRScanner(false);
  };

  const handleQuickCheckIn = () => {
    if (selectedStore && pinForm.watch("pin").length === 4) {
      // First verify QR and location, then login
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            checkIn({
              storeId: selectedStore.id,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            // After successful check-in, proceed with PIN login
            onPinSubmit({
              pin: pinForm.watch("pin"),
              storeId: selectedStore.id,
            });
          },
          () => {
            // Proceed without location
            checkIn({ storeId: selectedStore.id });
            onPinSubmit({
              pin: pinForm.watch("pin"),
              storeId: selectedStore.id,
            });
          }
        );
      } else {
        checkIn({ storeId: selectedStore.id });
        onPinSubmit({
          pin: pinForm.watch("pin"),
          storeId: selectedStore.id,
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto">
            <Store className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">RestaurantTask</h1>
            <p className="text-gray-600">Task Management System</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-xl">Welcome Back</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pin" className="flex items-center space-x-2">
                  <Hash className="w-4 h-4" />
                  <span>Store Login</span>
                </TabsTrigger>
                <TabsTrigger value="admin" className="flex items-center space-x-2">
                  <Mail className="w-4 h-4" />
                  <span>Admin Login</span>
                </TabsTrigger>
              </TabsList>

              {/* PIN Login Tab */}
              <TabsContent value="pin" className="space-y-4">
                {/* Store Selection */}
                <div className="space-y-3">
                  <Label>Store Location</Label>
                  {selectedStore ? (
                    <div className="flex items-center justify-between p-3 bg-success-50 border border-success-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success-600" />
                        </div>
                        <div>
                          <p className="font-medium text-success-900">{selectedStore.name}</p>
                          <p className="text-sm text-success-700">Store verified</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedStore(null);
                          pinForm.setValue("storeId", 0);
                        }}
                        className="text-success-700 hover:text-success-800"
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowQRScanner(true)}
                      variant="outline"
                      className="w-full h-12 border-2 border-dashed border-primary-200 hover:border-primary-300 hover:bg-primary-50"
                    >
                      <QrCode className="w-5 h-5 mr-2 text-primary-600" />
                      <span className="text-primary-700">Scan Store QR Code</span>
                    </Button>
                  )}
                </div>

                {/* PIN Input */}
                <form onSubmit={pinForm.handleSubmit(onPinSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pin">4-Digit PIN</Label>
                    <Input
                      id="pin"
                      type="password"
                      maxLength={4}
                      placeholder="Enter your PIN"
                      {...pinForm.register("pin")}
                      className="text-center text-2xl tracking-widest font-mono h-12"
                      disabled={!selectedStore}
                    />
                    {pinForm.formState.errors.pin && (
                      <p className="text-sm text-destructive flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>{pinForm.formState.errors.pin.message}</span>
                      </p>
                    )}
                    {pinForm.formState.errors.storeId && (
                      <p className="text-sm text-destructive flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>{pinForm.formState.errors.storeId.message}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Button
                      type="submit"
                      disabled={isLoggingIn || !selectedStore || pinForm.watch("pin").length !== 4}
                      className="w-full h-12"
                    >
                      {isLoggingIn ? "Logging in..." : "Login"}
                    </Button>

                    {selectedStore && pinForm.watch("pin").length === 4 && (
                      <Button
                        type="button"
                        onClick={handleQuickCheckIn}
                        disabled={isCheckingIn || isLoggingIn}
                        variant="outline"
                        className="w-full h-12 border-success-200 text-success-700 hover:bg-success-50"
                      >
                        {isCheckingIn ? (
                          "Checking in..."
                        ) : (
                          <>
                            <MapPin className="w-4 h-4 mr-2" />
                            Quick Check-in & Login
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </form>

                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    Need help? Contact your store manager for your PIN.
                  </p>
                </div>
              </TabsContent>

              {/* Admin Login Tab */}
              <TabsContent value="admin" className="space-y-4">
                <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@restaurant.com"
                        {...emailForm.register("email")}
                        className="pl-10 h-12"
                      />
                    </div>
                    {emailForm.formState.errors.email && (
                      <p className="text-sm text-destructive flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>{emailForm.formState.errors.email.message}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        {...emailForm.register("password")}
                        className="pl-10 h-12"
                      />
                    </div>
                    {emailForm.formState.errors.password && (
                      <p className="text-sm text-destructive flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>{emailForm.formState.errors.password.message}</span>
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full h-12"
                  >
                    {isLoggingIn ? "Logging in..." : "Login as Admin"}
                  </Button>
                </form>

                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    Admin access for store management and reporting.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Role Badges */}
        <div className="flex justify-center space-x-2">
          <Badge variant="secondary" className="text-xs">
            <Hash className="w-3 h-3 mr-1" />
            Store Staff
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Mail className="w-3 h-3 mr-1" />
            Administrators
          </Badge>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Secure task management for restaurants
          </p>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onSuccess={handleQRSuccess}
      />
    </div>
  );
}
