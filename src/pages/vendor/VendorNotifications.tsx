import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { notificationService } from "@/services/notificationService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/notification";

const typeIcon: Record<string, string> = {
  order_placed: "🛒",
  order_shipped: "📦",
  order_delivered: "✅",
  vendor_verified: "🛡️",
  review_submitted: "⭐",
};

const VendorNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    notificationService.getUserNotifications(user.id, 50).then((data) => {
      setNotifications(data);
      setLoading(false);
    });

    const unsub = notificationService.subscribeToNotifications(user.id, (n) => {
      setNotifications((prev) => [n, ...prev]);
    });
    return unsub;
  }, [user]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    await notificationService.markAllAsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleMarkAsRead = async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
          </Button>
        )}
      </div>

      <Card className="marketplace-shadow">
        <CardContent className="p-0 divide-y">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No notifications yet</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  "w-full text-left px-4 py-4 hover:bg-muted/50 transition-colors flex gap-3",
                  !n.isRead && "bg-primary/5"
                )}
                onClick={() => !n.isRead && handleMarkAsRead(n.id)}
              >
                <span className="text-xl shrink-0">{typeIcon[n.type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("text-sm", !n.isRead && "font-semibold")}>{n.title}</p>
                    {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorNotifications;
