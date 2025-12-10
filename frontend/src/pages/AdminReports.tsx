import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import AdminNavbar from "@/components/AdminNavbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReportedItems, markReportFixed, notifySellerAboutReport } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { Flag, Package, User, Calendar, ExternalLink, Bell, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
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
import { format } from "date-fns";
import { formatCategory, formatCondition } from "@/lib/utils";
import { normalizeImageUrl } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminReports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFixedReports, setShowFixedReports] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingReportId, setPendingReportId] = useState<number | null>(null);

  // Check if user is admin
  useEffect(() => {
    if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const { data: allReports, isLoading, error } = useQuery({
    queryKey: ["adminReports"],
    queryFn: () => getReportedItems(true), // Get both resolved and unresolved
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const notifySellerMutation = useMutation({
    mutationFn: notifySellerAboutReport,
    onSuccess: () => {
      // Don't invalidate - just show success, report should stay visible
      toast.success("Seller has been notified");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to notify seller");
    },
  });

  const markFixedMutation = useMutation({
    mutationFn: markReportFixed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminReports"] });
      queryClient.invalidateQueries({ queryKey: ["adminReportsCount"] }); // Invalidate count for instant update
      toast.success("Report marked as fixed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to mark report as fixed");
    },
  });

  const handleNotifySeller = (reportId: number) => {
    notifySellerMutation.mutate(reportId);
  };

  const handleMarkFixed = (reportId: number) => {
    // Find the report to check for changes
    const report = allReports?.find(r => r.report_id === reportId);
    const hasChanges = report?.has_changes && report?.changes && Object.keys(report.changes).length > 0;
    
    if (!hasChanges) {
      // Show confirmation dialog if no changes
      setPendingReportId(reportId);
      setShowConfirmDialog(true);
    } else {
      // Mark as fixed directly if there are changes
      markFixedMutation.mutate(reportId);
    }
  };

  const handleConfirmMarkFixed = () => {
    if (pendingReportId) {
      markFixedMutation.mutate(pendingReportId);
      setPendingReportId(null);
      setShowConfirmDialog(false);
    }
  };

  // Separate unresolved and resolved reports
  const unresolvedReports = allReports?.filter(r => !r.is_resolved && !r.is_dismissed) || [];
  const fixedReports = allReports?.filter(r => r.is_resolved) || [];

  if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading reports...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-destructive">Error loading reports</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Flag className="h-8 w-8" />
            Reported Listings
          </h1>
          <p className="text-muted-foreground">
            Review and manage listings that have been reported as incomplete
          </p>
        </div>

        {!allReports || allReports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No reported listings</p>
              <p className="text-sm text-muted-foreground mt-2">
                All reported listings have been resolved or dismissed
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Unresolved Reports */}
            <div className="space-y-4 mb-8">
              <h2 className="text-xl font-semibold text-foreground">Open Reports</h2>
              {unresolvedReports.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">No open reports</p>
                  </CardContent>
                </Card>
              ) : (
                unresolvedReports.map((report) => (
                  <Card key={report.report_id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 mb-2">
                            <Package className="h-5 w-5" />
                            {report.item.title}
                          </CardTitle>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="destructive">
                              {report.report_type === "incomplete_info" ? "Incomplete Info" :
                               report.report_type === "no_photos" ? "No Photos" :
                               report.report_type === "inappropriate" ? "Inappropriate" : "Other"}
                            </Badge>
                            <Badge variant="secondary">${report.item.price.toFixed(2)}</Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/items/${report.item.id}`, { state: { fromAdmin: true, reportId: report.report_id } })}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Listing
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>Seller: {report.seller?.username || "Unknown"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{format(new Date(report.reported_at), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      {report.description && (
                        <div className="mb-4 p-2 bg-muted rounded text-sm">
                          <strong>Comment:</strong> {report.description}
                        </div>
                      )}
                      {report.has_changes && report.changes && (
                        <div className="mb-4 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm border border-yellow-200 dark:border-yellow-800">
                          <strong>⚠️ Changes detected after seller fixed:</strong>
                          <ul className="list-disc list-inside mt-1 space-y-1">
                            {Object.entries(report.changes).map(([key, change]: [string, any]) => (
                              <li key={key}>
                                <strong>{key}:</strong> "{change.old}" → "{change.new}"
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex gap-2 pt-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNotifySeller(report.report_id)}
                          disabled={notifySellerMutation.isPending}
                        >
                          <Bell className="h-4 w-4 mr-2" />
                          {notifySellerMutation.isPending ? "Notifying..." : "Notify Seller"}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleMarkFixed(report.report_id)}
                          disabled={markFixedMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {markFixedMutation.isPending ? "Marking..." : "Mark as Fixed"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Fixed Reports (Collapsible) */}
            {fixedReports.length > 0 && (
              <Card className="mt-8">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setShowFixedReports(!showFixedReports)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Fixed Reports ({fixedReports.length})
                    </CardTitle>
                    {showFixedReports ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
                {showFixedReports && (
                  <CardContent>
                    <div className="space-y-4">
                      {fixedReports.map((report) => (
                        <Card key={report.report_id} className="bg-muted/30">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="flex items-center gap-2 mb-2 text-base">
                                  <Package className="h-4 w-4" />
                                  {report.item.title}
                                </CardTitle>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {formatCategory(report.item.category)}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {formatCondition(report.item.condition)}
                                  </Badge>
                                  <Badge variant="default" className="text-xs bg-green-600">
                                    Fixed
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/admin/listings`)}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Listing
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                  <User className="h-3 w-3" />
                                  <span className="font-medium">Seller:</span>
                                  <span>{report.seller?.username || "Unknown"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span className="font-medium">Fixed on:</span>
                                  <span>
                                    {report.resolved_at
                                      ? format(new Date(report.resolved_at), "MMM d, yyyy 'at' h:mm a")
                                      : "N/A"}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <p className="text-muted-foreground line-clamp-2">
                                  {report.item.description}
                                </p>
                                <p className="font-bold text-primary mt-1">
                                  ${report.item.price.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </>
        )}
      </main>

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
            <AlertDialogCancel onClick={() => setPendingReportId(null)}>Cancel</AlertDialogCancel>
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

