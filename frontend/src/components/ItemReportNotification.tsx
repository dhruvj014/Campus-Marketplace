import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { wsClient } from "@/lib/websocket";
import { AlertTriangle } from "lucide-react";
import { authStore } from "@/store/authStore";

interface ItemReportData {
  item_id: number;
  item_title: string;
  report_id: number;
  seller_id: number;
  message: string;
  timestamp: string;
}

export default function ItemReportNotification() {
  const [showDialog, setShowDialog] = useState(false);
  const [reportData, setReportData] = useState<ItemReportData | null>(null);
  const navigate = useNavigate();


  useEffect(() => {
    const handleNotification = (notification: any) => {
      // Handle notification type messages from WebSocket
      // The backend sends: { type: "notification", data: { type: "item_reported", data: {...} } }
      if (notification && notification.type === "item_reported" && notification.data) {
        const reportData = notification.data;
        
        // Only show notification to the seller (verify seller_id matches current user)
        const currentUserId = authStore.user?.user_id;
        if (currentUserId && reportData.seller_id === currentUserId) {
          setReportData(reportData);
          setShowDialog(true);
        } else {
          console.log("Item report notification ignored - not the seller", {
            currentUserId,
            sellerId: reportData.seller_id
          });
        }
      }
    };

    // Listen for notification messages
    wsClient.on("notification", handleNotification);

    return () => {
      wsClient.off("notification", handleNotification);
    };
  }, []);

  const handleFixIt = () => {
    if (reportData) {
      // Navigate to item and open edit dialog
      navigate(`/items/${reportData.item_id}?edit=true`);
      setShowDialog(false);
      setReportData(null);
    }
  };

  const handleDismiss = () => {
    // Just close the popup, don't mark report as dismissed
    setShowDialog(false);
    setReportData(null);
  };

  if (!reportData) return null;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Listing Reported
          </DialogTitle>
          <DialogDescription className="pt-2">
            {reportData.message}
          </DialogDescription>
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              <strong>Listing:</strong> {reportData.item_title}
            </p>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleDismiss}
          >
            Dismiss
          </Button>
          <Button
            onClick={handleFixIt}
          >
            Fix it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

