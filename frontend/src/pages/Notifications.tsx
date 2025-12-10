import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  Notification,
} from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { authStore } from "@/store/authStore";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, CheckCheck, Trash2, MessageSquare, Package, ShoppingBag, Info } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useNavigate, useLocation } from "react-router-dom";
import { BrowserNotifications } from "@/lib/notifications";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "message":
      return MessageSquare;
    case "item_interest":
      return ShoppingBag;
    case "item_sold":
      return Package;
    default:
      return Info;
  }
};

export default function Notifications() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [now, setNow] = useState(Date.now());

  // Request notification permission on mount
  useEffect(() => {
    BrowserNotifications.requestPermission();
  }, []);

  // Update timestamps every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Get notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => getNotifications(filter === "unread", 0, 100),
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  // Get unread count
  const { data: unreadCountData } = useQuery({
    queryKey: ["unreadNotificationCount"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  // Mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
    },
  });

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
    },
  });

  // Set up WebSocket listener for real-time notifications
  useEffect(() => {
    const user = authStore.user;
    const token = localStorage.getItem("access_token");

    if (user && token) {
      console.log("Connecting WebSocket for notifications, user:", user.user_id);
      wsClient.connect(user.user_id, token);

      const handleNewNotification = (data: Notification) => {
        console.log("Received new notification via WebSocket:", data);
        
        // Show browser notification if not on notifications page or page not focused
        const isOnNotificationsPage = location.pathname === "/notifications";
        if (!isOnNotificationsPage || !document.hasFocus()) {
          BrowserNotifications.showNotification(data.title, {
            body: data.message,
            tag: `notification-${data.id}`,
            data: { notificationId: data.id },
            onClick: () => {
              if (data.related_conversation_id) {
                navigate(`/chat/${data.related_conversation_id}`);
              } else if (data.related_item_id) {
                navigate(`/items/${data.related_item_id}`);
              } else {
                navigate("/notifications");
              }
            },
          });
        }
        
        // Immediately update the cache with the new notification
        queryClient.setQueryData(["notifications", filter], (old: Notification[] | undefined) => {
          if (!old) return [data];
          // Add to beginning if it's not already there
          const exists = old.some(n => n.id === data.id);
          if (exists) return old;
          return [data, ...old];
        });
        // Also update unread count immediately
        queryClient.setQueryData(["unreadNotificationCount"], (old: { unread_count: number } | undefined) => {
          if (!old) return { unread_count: 1 };
          return { unread_count: old.unread_count + 1 };
        });
        // Then invalidate to ensure consistency
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
      };

      wsClient.on("notification", handleNewNotification);

      return () => {
        wsClient.off("notification", handleNewNotification);
      };
    }
  }, [queryClient]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }

    // Navigate based on notification type
    if (notification.related_conversation_id) {
      navigate(`/chat/${notification.related_conversation_id}`);
    } else if (notification.related_item_id) {
      navigate(`/items/${notification.related_item_id}`);
    }
  };

  const unreadCount = unreadCountData?.unread_count || 0;
  const unreadNotifications = notifications?.filter((n) => !n.is_read) || [];

  // Group notifications by sender (related_user_id) for message notifications
  const groupedNotifications = notifications?.reduce((acc, notification) => {
    if (notification.type === "message" && notification.related_user_id) {
      const key = `user-${notification.related_user_id}`;
      if (!acc[key]) {
        acc[key] = {
          notifications: [],
          count: 0,
          latest: notification,
          senderName: notification.message.split(" sent you a message")[0] || "Someone",
        };
      }
      acc[key].notifications.push(notification);
      acc[key].count += 1;
      // Keep the latest notification
      if (new Date(notification.created_at) > new Date(acc[key].latest.created_at)) {
        acc[key].latest = notification;
      }
    } else {
      // Non-message notifications or notifications without related_user_id are shown individually
      const key = `single-${notification.id}`;
      acc[key] = {
        notifications: [notification],
        count: 1,
        latest: notification,
        senderName: null,
      };
    }
    return acc;
  }, {} as Record<string, { notifications: Notification[]; count: number; latest: Notification; senderName: string | null }>) || {};

  const displayNotifications = Object.values(groupedNotifications).sort((a, b) => 
    new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime()
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bell className="w-6 h-6" />
                Notifications
              </h1>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  Mark all as read
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All
              </Button>
              <Button
                variant={filter === "unread" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("unread")}
              >
                Unread {unreadCount > 0 && <Badge className="ml-2">{unreadCount}</Badge>}
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-12rem)]">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading notifications...</div>
            ) : displayNotifications && displayNotifications.length > 0 ? (
              <div className="divide-y">
                {displayNotifications.map((group) => {
                  const notification = group.latest;
                  const Icon = getNotificationIcon(notification.type);
                  const hasUnread = group.notifications.some(n => !n.is_read);
                  const displayTitle = group.count > 1 && notification.type === "message" && group.senderName
                    ? `New messages from ${group.senderName} (${group.count})`
                    : notification.title;
                  
                  return (
                    <div
                      key={`group-${notification.id}`}
                      className={cn(
                        "p-4 hover:bg-muted/50 transition-colors cursor-pointer",
                        hasUnread && "bg-primary/5"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "p-2 rounded-full",
                            hasUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {hasUnread && (
                                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                              )}
                              <h3
                                className={cn(
                                  "font-medium truncate",
                                  hasUnread && "font-semibold"
                                )}
                              >
                                {displayTitle}
                              </h3>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Delete all notifications in the group
                                group.notifications.forEach(n => deleteMutation.mutate(n.id));
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <p
                            className={cn(
                              "text-sm",
                              hasUnread ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1" key={now}>
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

