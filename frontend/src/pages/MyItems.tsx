import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import MyItemCard from "@/components/MyItemCard";
import { Button } from "@/components/ui/button";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { Plus } from "lucide-react";
import { getMyItems } from "@/lib/api";
import { ItemStatus } from "@/types";

export default function MyItems() {
  const navigate = useNavigate();

  // Redirect admin to admin pages
  useEffect(() => {
    if (authStore.user?.role === UserRole.ADMIN) {
      navigate("/admin/listings");
    }
  }, [navigate]);

  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all");

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["myItems"],
    queryFn: getMyItems,
    enabled: authStore.isAuthenticated,
  });

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!items) return [];

    // Filter by status
    let filtered = items;
    if (statusFilter !== "all") {
      filtered = items.filter(item => item.status === statusFilter);
    }

    // Sort: all statuses except SOLD first, then SOLD items last
    return [...filtered].sort((a, b) => {
      const aIsSold = a.status === ItemStatus.SOLD;
      const bIsSold = b.status === ItemStatus.SOLD;

      // If one is sold and the other isn't, sold goes last
      if (aIsSold && !bIsSold) return 1;
      if (!aIsSold && bIsSold) return -1;

      // If both have same sold status, maintain original order (by creation date, newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, statusFilter]);

  if (!authStore.isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-muted-foreground mb-4">Please log in to view your items.</p>
          <Link to="/login">
            <Button>Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-muted-foreground">Loading your items...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-destructive">
            Error loading items: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Listings</h1>
            <p className="text-muted-foreground mt-1">Manage your items for sale</p>
          </div>
          <Link to="/create-item">
            <Button className="flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Create Listing</span>
            </Button>
          </Link>
        </div>

        {/* Status Filter Buttons */}
        {items && items.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              size="sm"
              className="rounded-full"
            >
              All
            </Button>
            <Button
              variant={statusFilter === ItemStatus.AVAILABLE ? "default" : "outline"}
              onClick={() => setStatusFilter(ItemStatus.AVAILABLE)}
              size="sm"
              className="rounded-full"
            >
              Available
            </Button>
            <Button
              variant={statusFilter === ItemStatus.RESERVED ? "default" : "outline"}
              onClick={() => setStatusFilter(ItemStatus.RESERVED)}
              size="sm"
              className="rounded-full"
            >
              On Hold
            </Button>
            <Button
              variant={statusFilter === ItemStatus.SOLD ? "default" : "outline"}
              onClick={() => setStatusFilter(ItemStatus.SOLD)}
              size="sm"
              className="rounded-full"
            >
              Sold
            </Button>
          </div>
        )}

        {/* Display items */}
        {items && items.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-border">
            <p className="text-xl text-muted-foreground mb-4">You haven't created any listings yet</p>
            <Link to="/create-item">
              <Button>Create Your First Listing</Button>
            </Link>
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-border">
            <p className="text-xl text-muted-foreground mb-4">No items found with the selected filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedItems.map((item) => (
              <MyItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
