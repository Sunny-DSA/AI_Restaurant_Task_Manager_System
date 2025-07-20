import { useEffect, useState, useRef } from "react";
import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";

interface WebSocketMessage {
  type: string;
  task?: any;
  notification?: any;
  [key: string]: any;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = () => {
    if (!user?.id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Authenticate with the WebSocket server
        ws.send(JSON.stringify({ type: "auth", userId: user.id }));
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case "auth_success":
              console.log("WebSocket authenticated successfully");
              break;
              
            case "task_update":
              // Invalidate task-related queries to refetch data
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
              queryClient.invalidateQueries({ queryKey: ["/api/tasks/available"] });
              
              // Show notification for relevant task updates
              if (message.task) {
                const task = message.task;
                if (task.claimedBy === user.id) {
                  toast({
                    title: "Task Updated",
                    description: `Your task "${task.title}" has been updated`,
                  });
                } else if (task.assigneeId === user.id || task.assigneeType === "store_wide") {
                  toast({
                    title: "New Task Available",
                    description: `Task "${task.title}" is now available`,
                  });
                }
              }
              break;
              
            case "notification":
              // Handle real-time notifications
              if (message.notification) {
                toast({
                  title: message.notification.title,
                  description: message.notification.message,
                });
                
                // Invalidate notifications query
                queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              }
              break;
              
            default:
              console.log("Unknown WebSocket message type:", message.type);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        
        // Attempt to reconnect after a delay
        if (user?.id) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  };

  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  useEffect(() => {
    if (user?.id) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user?.id]);

  return {
    isConnected,
    sendMessage,
    connect,
    disconnect,
  };
}
