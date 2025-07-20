import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, X, CheckCircle } from "lucide-react";

interface PhotoUploadProps {
  taskId: number;
  taskItemId?: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  required?: boolean;
}

export default function PhotoUpload({
  taskId,
  taskItemId,
  isOpen,
  onClose,
  onSuccess,
  required = false,
}: PhotoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [useCamera, setUseCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Try to get location for geo-stamping
      return new Promise<void>((resolve, reject) => {
        const upload = (location?: { latitude: number; longitude: number }) => {
          taskApi.uploadPhoto(taskId, file, location, taskItemId)
            .then(() => resolve())
            .catch(reject);
        };

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              upload({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            () => {
              upload(); // Upload without location if geolocation fails
            }
          );
        } else {
          upload();
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Photo uploaded successfully",
        description: "Photo has been attached to the task",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onSuccess?.();
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setUseCamera(true);
      }
    } catch (error) {
      toast({
        title: "Camera access failed",
        description: "Please allow camera access or select a file",
        variant: "destructive",
      });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `task-${taskId}-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        
        // Stop camera
        const stream = video.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setUseCamera(false);
      }
    }, "image/jpeg", 0.8);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: "Please select an image smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a photo to upload",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(selectedFile);
  };

  const handleClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    // Stop camera if running
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    
    setSelectedFile(null);
    setPreviewUrl("");
    setUseCamera(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Camera className="w-5 h-5" />
            <span>{required ? "Required Photo" : "Upload Photo"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedFile && !useCamera && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  {required 
                    ? "This task requires photo verification" 
                    : "Take a photo or select from gallery"
                  }
                </p>
                <div className="space-y-2">
                  <Button onClick={startCamera} className="w-full">
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Select from Gallery
                  </Button>
                </div>
              </div>
            </div>
          )}

          {useCamera && (
            <div className="space-y-4">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-64 bg-black rounded-lg object-cover"
                />
              </div>
              <div className="flex space-x-2">
                <Button onClick={capturePhoto} className="flex-1">
                  <Camera className="w-4 h-4 mr-2" />
                  Capture
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUseCamera(false);
                    const video = videoRef.current;
                    if (video?.srcObject) {
                      const stream = video.srcObject as MediaStream;
                      stream.getTracks().forEach(track => track.stop());
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {selectedFile && previewUrl && (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                      setPreviewUrl("");
                    }
                  }}
                  className="absolute top-2 right-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="flex-1"
                >
                  {uploadMutation.isPending ? (
                    "Uploading..."
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Upload Photo
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
