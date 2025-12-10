import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, AlertTriangle, User, Calendar, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { getReportedItems, markReportFixed } from "@/lib/api";
import { toast } from "sonner";

interface ReportSidebarProps {
  reportId: number;
  onClose: () => void;
}

export default function ReportSidebar({ reportId, onClose }: ReportSidebarProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: allReports } = useQuery({
    queryKey: ["adminReports"],
    queryFn: () => getReportedItems(true),
  });

  const report = allReports?.find((r: any) => r.report_id === reportId);

  const markFixedMutation = useMutation({
    mutationFn: markReportFixed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminReports"] });
      queryClient.invalidateQueries({ queryKey: ["adminReportsCount"] }); // Invalidate count for instant update
      toast.success("Report marked as fixed");
      onClose(); // Close sidebar after marking as fixed
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to mark report as fixed");
    },
  });

  if (!report) {
    return null;
  }

  const reportTypeLabels: Record<string, string> = {
    incomplete_info: "Incomplete Information",
    no_photos: "No Photos",
    inappropriate: "Inappropriate Listing",
    other: "Other",
  };

  // Calculate number of changes
  const changesCount = report.changes ? Object.keys(report.changes).length : 0;
  const hasChanges = report.has_changes && changesCount > 0;

  const handleMarkFixed = () => {
    if (!hasChanges) {
      // Show confirmation dialog if no changes
      setShowConfirmDialog(true);
    } else {
      // Mark as fixed directly if there are changes
      markFixedMutation.mutate(reportId);
    }
  };

  const handleConfirmMarkFixed = () => {
    setShowConfirmDialog(false);
    markFixedMutation.mutate(reportId);
  };

  if (isMinimized) {
    return (
      <Button
        onClick={() => setIsMinimized(false)}
        className="fixed top-20 right-4 z-[60] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 h-12 px-4 rounded-full pointer-events-auto"
        size="lg"
      >
        <ChevronLeft className="h-5 w-5 mr-2" />
        <span className="font-semibold">Report Details</span>
      </Button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border shadow-lg z-50 overflow-y-auto">
      <div className="sticky top-0 bg-background border-b border-border p-4 space-y-4">
        {/* Header with title and buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="font-semibold text-lg">Report Details</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsMinimized(true)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Mark as Fixed Button at the top */}
        <Button
          onClick={handleMarkFixed}
          disabled={markFixedMutation.isPending}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
          size="lg"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {markFixedMutation.isPending ? "Marking..." : "Mark as Fixed"}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Report Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm font-medium mb-1">Reason</div>
              <Badge variant="destructive">{reportTypeLabels[report.report_type] || report.report_type}</Badge>
            </div>
            {report.description && (
              <div>
                <div className="text-sm font-medium mb-1">Comment</div>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
            )}
            <div>
              <div className="text-sm font-medium mb-1">Reported By</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{report.reporter?.username || "Anonymous"}</span>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Reported On</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(report.reported_at), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
            </div>
            {report.is_resolved && (
              <div>
                <div className="text-sm font-medium mb-1">Status</div>
                <Badge variant="default" className="bg-green-600">
                  Resolved
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Changes Status Card - Show regardless of resolution status */}
        {report.item_snapshot ? (
          <Card className={hasChanges ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20" : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"}>
            <CardHeader>
              <CardTitle className={`text-base flex items-center gap-2 ${hasChanges ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {hasChanges ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {hasChanges ? `${changesCount} Change${changesCount !== 1 ? 's' : ''} Made` : "No Changes So Far"}
              </CardTitle>
            </CardHeader>
            {hasChanges && report.changes && (
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  The seller made changes to the listing:
                </p>
                <div className="space-y-2">
                  {Object.entries(report.changes).map(([key, change]: [string, any]) => (
                    <div key={key} className="text-sm">
                      <div className="font-medium capitalize mb-1">{key.replace(/_/g, " ")}</div>
                      <div className="pl-2 border-l-2 border-green-300 dark:border-green-700 space-y-1">
                        <div className="text-xs text-muted-foreground line-through">
                          Old: {String(change.old)}
                        </div>
                        <div className="text-xs font-medium">
                          New: {String(change.new)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ) : (
          <Card className="border-muted bg-muted/30">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                No snapshot available
              </p>
            </CardContent>
          </Card>
        )}

        {report.item_snapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Item State at Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Title:</span> {report.item_snapshot.title}
              </div>
              <div>
                <span className="font-medium">Price:</span> ${report.item_snapshot.price?.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Description:</span>
                <p className="text-muted-foreground mt-1 line-clamp-3">
                  {report.item_snapshot.description}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmation Dialog for marking fixed with no changes */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Mark as Fixed</AlertDialogTitle>
            <AlertDialogDescription>
              No changes have been detected for this listing. Are you sure you want to mark this report as fixed despite no changes being made?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMarkFixed}
              className="bg-green-600 hover:bg-green-700"
            >
              Yes, Mark as Fixed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

