import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import AdminNavbar from "@/components/AdminNavbar";
import ReportSidebar from "@/components/ReportSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Edit, Trash2, Search, Eye } from "lucide-react";
import { getAllItemsAdmin, deleteItem, updateItem } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole, Item, ItemStatus } from "@/types";
import { toast } from "sonner";
import { formatCategory, formatCondition, formatStatus } from "@/lib/utils";

export default function AdminManageListings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  
  // Handle itemId and reportId from query params (when coming from reports page)
  const reportId = searchParams.get("reportId");
  const [showReportSidebar, setShowReportSidebar] = useState(!!reportId);
  
  useEffect(() => {
    const itemId = searchParams.get("itemId");
    if (itemId) {
      setSearchTerm(itemId);
    }
  }, [searchParams]);

  // Check if user is admin
  useEffect(() => {
    if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["adminItems", statusFilter],
    queryFn: () => getAllItemsAdmin(statusFilter === "all" ? undefined : statusFilter),
    enabled: authStore.isAuthenticated && authStore.user?.role === UserRole.ADMIN,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminItems"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Listing deleted successfully");
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete listing");
    },
  });

  // Status order: available, reserved (on hold), sold, inactive (archived), incomplete, removed, etc.
  const statusOrder: Record<ItemStatus, number> = {
    [ItemStatus.AVAILABLE]: 1,
    [ItemStatus.RESERVED]: 2,
    [ItemStatus.SOLD]: 3,
    [ItemStatus.INACTIVE]: 4,
    [ItemStatus.INCOMPLETE]: 5,
    [ItemStatus.REMOVED]: 6,
  };

  const filteredAndSortedItems = useMemo(() => {
    if (!items) return [];
    
    // Filter by search term
    let filtered = items.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
    
    // Sort by status order, then by creation date (newest first)
    return filtered.sort((a, b) => {
      const aOrder = statusOrder[a.status] || 999;
      const bOrder = statusOrder[b.status] || 999;
      
      // First sort by status order
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // If same status, sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, searchTerm]);

  const handleDelete = (item: Item) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete.id);
    }
  };

  if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background relative">
      <AdminNavbar />
      {showReportSidebar && reportId && (
        <ReportSidebar reportId={parseInt(reportId)} onClose={() => setShowReportSidebar(false)} />
      )}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Manage Listings</h1>
          <p className="text-muted-foreground">View and manage all marketplace listings</p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="search"
                placeholder="Search listings..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value={ItemStatus.AVAILABLE}>Available</SelectItem>
              <SelectItem value={ItemStatus.SOLD}>Sold</SelectItem>
              <SelectItem value={ItemStatus.RESERVED}>Reserved</SelectItem>
              <SelectItem value={ItemStatus.INACTIVE}>Inactive</SelectItem>
              <SelectItem value={ItemStatus.INCOMPLETE}>Incomplete</SelectItem>
              <SelectItem value={ItemStatus.REMOVED}>Removed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading listings...</div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">Error loading listings</div>
        ) : filteredAndSortedItems && filteredAndSortedItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No listings found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedItems?.map((item) => (
              <Card key={item.id} className="hover-lift">
                <div className="aspect-square bg-muted/30 overflow-hidden rounded-t-xl">
                  {item.item_url ? (
                    <img
                      src={item.item_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/20">
                      <span className="text-sm">No image</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium text-base truncate mb-1">{item.title}</h3>
                  <p className="text-lg font-semibold text-foreground mb-2">${item.price.toFixed(2)}</p>
                  <div className="flex gap-1.5 mb-3">
                    <Badge variant="secondary" className="text-xs">
                      {formatCategory(item.category)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {formatCondition(item.condition)}
                    </Badge>
                    <Badge
                      variant={item.status === ItemStatus.AVAILABLE ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {formatStatus(item.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{item.description}</p>
                  <div className="flex gap-2">
                    <Link to={`/items/${item.id}`} state={{ fromAdmin: true }} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </Link>
                    <Link to={`/items/${item.id}`} state={{ fromAdmin: true }} className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      className="flex-1"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Listing</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{itemToDelete?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
