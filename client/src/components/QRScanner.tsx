import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, QrCode, X } from "lucide-react";

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (storeId: number, storeName: string) => void;
}

export default function QRScanner({ isOpen, onClose, onSuccess }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const { verifyQR, isVerifyingQR } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" } // Use back camera if available
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsScanning(true);
      }
    } catch (error) {
      toast({
        title: "Camera access failed",
        description: "Please allow camera access or use manual input",
        variant: "destructive",
      });
      setShowManualInput(true);
    }
  }, [toast]);

  const handleScanResult = useCallback((qrData: string) => {
    if (!qrData) return;

    // Get user's location for geofence validation
    const processQR = (latitude?: number, longitude?: number) => {
      verifyQR(
        { qrData, latitude, longitude },
        {
          onSuccess: (result) => {
            if (result.isValid) {
              stopCamera();
              onSuccess(result.storeId, result.storeName || `Store ${result.storeId}`);
              onClose();
            } else {
              toast({
                title: "Invalid QR Code",
                description: "This QR code is not valid or has expired",
                variant: "destructive",
              });
            }
          },
          onError: (error: Error) => {
            toast({
              title: "QR Verification Failed",
              description: error.message,
              variant: "destructive",
            });
          },
        }
      );
    };

    // Try to get location, but proceed without it if unavailable
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          processQR(position.coords.latitude, position.coords.longitude);
        },
        () => {
          processQR(); // Proceed without location
        }
      );
    } else {
      processQR();
    }
  }, [verifyQR, stopCamera, onSuccess, onClose, toast]);

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      toast({
        title: "Please enter QR code",
        description: "Enter the QR code data manually",
        variant: "destructive",
      });
      return;
    }
    
    handleScanResult(manualCode.trim());
  };

  const handleClose = () => {
    stopCamera();
    setManualCode("");
    setShowManualInput(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <QrCode className="w-5 h-5" />
            <span>Scan Store QR Code</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showManualInput ? (
            <>
              {!isScanning ? (
                <div className="text-center space-y-4">
                  <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center mx-auto">
                    <Camera className="w-16 h-16 text-gray-400" />
                  </div>
                  <Button onClick={startCamera} className="w-full">
                    <Camera className="w-4 h-4 mr-2" />
                    Start Camera
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowManualInput(true)}
                    className="w-full"
                  >
                    Enter Code Manually
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-48 bg-black rounded-lg object-cover"
                    />
                    <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none">
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white rounded-lg"></div>
                    </div>
                  </div>
                  <div className="text-center text-sm text-gray-600">
                    Position the QR code within the frame
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={stopCamera} className="flex-1">
                      Stop Camera
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        stopCamera();
                        setShowManualInput(true);
                      }}
                      className="flex-1"
                    >
                      Manual Input
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="manual-code">QR Code Data</Label>
                <Input
                  id="manual-code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Paste QR code data here..."
                  className="mt-1"
                />
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={handleManualSubmit}
                  disabled={isVerifyingQR || !manualCode.trim()}
                  className="flex-1"
                >
                  {isVerifyingQR ? "Verifying..." : "Verify Code"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowManualInput(false)}
                  className="flex-1"
                >
                  Back to Camera
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
