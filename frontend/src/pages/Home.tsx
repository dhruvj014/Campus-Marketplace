import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import ListingCard from "@/components/ListingCard";
import ListingCardSkeleton from "@/components/skeletons/ListingCardSkeleton";
import EmptyState from "@/components/EmptyState";
import ComparisonPopup from "@/components/ComparisonPopup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, Clock, ArrowUpDown, Book, Laptop, Armchair, Shirt, Dumbbell, Package, Home as HomeIcon } from "lucide-react";
import { searchItems, ItemSearchParams } from "@/lib/api";
import { Item, ItemCategory, ItemCondition, ItemStatus, Message } from "@/types";
import {
  debounce,
  getSearchHistory,
  addToSearchHistory,
  clearSearchHistory
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { wsClient } from "@/lib/websocket";
import { authStore } from "@/store/authStore";
import { BrowserNotifications } from "@/lib/notifications";

type SortOption = "relevance" | "price_low" | "price_high" | "date_new" | "date_old" | "title_asc" | "title_desc";

export default function Home() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCondition, setSelectedCondition] = useState<string>("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [debouncedMinPrice, setDebouncedMinPrice] = useState("");
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [showSearchHistory, setShowSearchHistory] = useState(false);

  // Set up WebSocket listeners for real-time updates
  useEffect(() => {
    const user = authStore.user;
    const token = localStorage.getItem("access_token");

    if (user && token) {
      wsClient.connect(user.user_id, token);

      const handleNewMessage = (data: Message) => {
        if (data.sender_id !== user.user_id && !data.is_read) {
          const senderName = data.sender_full_name || data.sender_username || "Someone";
          BrowserNotifications.showMessageNotification(
            senderName,
            data.content,
            data.conversation_id,
            (convId) => navigate(`/chat/${convId}`)
          );
        }
        // Immediately invalidate for instant updates
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
      };

      const handleConversationUpdated = (data: any) => {
        // Immediately invalidate for instant updates
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
      };

      const handlePurchaseOffer = (data: any) => {
        // Immediately invalidate for instant updates
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
      };

      const handleItemSold = (data: any) => {
        // Immediately invalidate for instant updates
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      };

      const handleNotification = (data: any) => {
        // Immediately invalidate for instant updates
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
      };

      wsClient.on("message", handleNewMessage);
      wsClient.on("conversation_updated", handleConversationUpdated);
      wsClient.on("purchase_offer", handlePurchaseOffer);
      wsClient.on("item_sold", handleItemSold);
      wsClient.on("notification", handleNotification);

      return () => {
        wsClient.off("message", handleNewMessage);
        wsClient.off("conversation_updated", handleConversationUpdated);
        wsClient.off("purchase_offer", handlePurchaseOffer);
        wsClient.off("item_sold", handleItemSold);
        wsClient.off("notification", handleNotification);
      };
    }
  }, [queryClient, navigate]);

  // Debounced search term update
  const debouncedSearchUpdate = useCallback(
    debounce((value: string) => {
      setDebouncedSearchTerm(value);
    }, 500),
    []
  );

  // Debounced price updates
  const debouncedMinPriceUpdate = useCallback(
    debounce((value: string) => {
      setDebouncedMinPrice(value);
    }, 500),
    []
  );

  const debouncedMaxPriceUpdate = useCallback(
    debounce((value: string) => {
      setDebouncedMaxPrice(value);
    }, 500),
    []
  );

  useEffect(() => {
    debouncedSearchUpdate(searchTerm);
  }, [searchTerm, debouncedSearchUpdate]);

  useEffect(() => {
    debouncedMinPriceUpdate(minPrice);
  }, [minPrice, debouncedMinPriceUpdate]);

  useEffect(() => {
    debouncedMaxPriceUpdate(maxPrice);
  }, [maxPrice, debouncedMaxPriceUpdate]);


  const filterParams = useMemo(() => {
    const params: ItemSearchParams = {};
    if (debouncedSearchTerm) params.search = debouncedSearchTerm;
    if (selectedCategory) params.category = selectedCategory;
    if (selectedCondition) params.condition = selectedCondition;
    if (debouncedMinPrice && !isNaN(parseFloat(debouncedMinPrice))) {
      params.min_price = parseFloat(debouncedMinPrice);
    }
    if (debouncedMaxPrice && !isNaN(parseFloat(debouncedMaxPrice))) {
      params.max_price = parseFloat(debouncedMaxPrice);
    }
    return params;
  }, [debouncedSearchTerm, selectedCategory, selectedCondition, debouncedMinPrice, debouncedMaxPrice]);

  const [showSold, setShowSold] = useState(false);

  const { data: items, isLoading, error } = useQuery<Item[]>({
    queryKey: ["items", filterParams, showSold],
    queryFn: async () => {
      const [available, reserved, sold] = await Promise.all([
        searchItems({ ...filterParams, status: ItemStatus.AVAILABLE }),
        searchItems({ ...filterParams, status: ItemStatus.RESERVED }),
        showSold ? searchItems({ ...filterParams, status: ItemStatus.SOLD }) : Promise.resolve([]),
      ]);
      const combined = [...available, ...reserved, ...(showSold ? sold : [])];
      const uniqueMap = new Map<number, Item>();
      combined.forEach((item) => uniqueMap.set(item.id, item));
      return Array.from(uniqueMap.values());
    },
  });

  // Sort items
  const sortedItems = useMemo(() => {
    if (!items) return [];
    const sorted = [...items];

    switch (sortBy) {
      case "price_low":
        return sorted.sort((a, b) => a.price - b.price);
      case "price_high":
        return sorted.sort((a, b) => b.price - a.price);
      case "date_new":
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "date_old":
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "title_asc":
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "title_desc":
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      default:
        return sorted;
    }
  }, [items, sortBy]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setSelectedCategory("");
    setSelectedCondition("");
    setMinPrice("");
    setMaxPrice("");
    setDebouncedMinPrice("");
    setDebouncedMaxPrice("");
  };

  const handleSearch = (query: string) => {
    setSearchTerm(query);
    if (query.trim()) {
      addToSearchHistory(query);
    }
    setShowSearchHistory(false);
  };

  const searchHistory = getSearchHistory();

  const hasActiveFilters = searchTerm || selectedCategory || selectedCondition || debouncedMinPrice || debouncedMaxPrice;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Airbnb-style Hero Search Section */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative w-full max-w-2xl group z-30">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-500" />
            <div className="relative flex items-center bg-card hover:bg-card/80 transition-colors duration-300 rounded-full shadow-elegant border border-border/40 p-2 pl-6">

              <input
                type="text"
                placeholder="Search for textbooks, electronics..."
                className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-muted-foreground/60 h-10"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSearchHistory(true);
                }}
                onFocus={() => setShowSearchHistory(true)}
                onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchTerm.trim()) {
                    handleSearch(searchTerm);
                  }
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setShowSearchHistory(false);
                  }}
                  className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <Button
                onClick={() => handleSearch(searchTerm)}
                size="icon"
                className="rounded-full w-10 h-10 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md ml-1"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {/* Search History Dropdown */}
            {showSearchHistory && searchHistory.length > 0 && (
              <div className="absolute top-full left-4 right-4 mt-2 bg-card border border-border/40 rounded-2xl shadow-elegant z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 p-2">
                <div className="flex items-center justify-between px-3 py-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Searches</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] rounded-full px-2 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSearchHistory();
                    }}
                  >
                    Clear
                  </Button>
                </div>
                {searchHistory.map((query, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSearch(query)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 rounded-xl text-sm flex items-center gap-3 transition-colors duration-150 group/item"
                  >
                    <div className="bg-muted/50 p-1.5 rounded-full group-hover/item:bg-white transition-colors">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    {query}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category Icon Strip */}
        <div className="mb-10 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          <div className="flex gap-8 min-w-max justify-center mx-auto">
            {[
              { id: "", label: "All Items", icon: HomeIcon },
              { id: ItemCategory.TEXTBOOKS, label: "Textbooks", icon: Book },
              { id: ItemCategory.ELECTRONICS, label: "Electronics", icon: Laptop },
              { id: ItemCategory.FURNITURE, label: "Furniture", icon: Armchair },
              { id: ItemCategory.CLOTHING, label: "Clothing", icon: Shirt },
              { id: ItemCategory.SPORTS_FITNESS, label: "Sports", icon: Dumbbell },
              { id: ItemCategory.OTHER, label: "Other", icon: Package },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex flex-col items-center gap-2 group min-w-[64px] cursor-pointer transition-all duration-200 ${selectedCategory === cat.id
                  ? "text-foreground opacity-100 scale-105"
                  : "text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground"
                  }`}
              >
                <div className={`p-3 rounded-full transition-all duration-300 ${selectedCategory === cat.id
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "bg-transparent group-hover:bg-muted"
                  }`}>
                  <cat.icon className={`w-6 h-6 ${selectedCategory === cat.id ? "stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                </div>
                <span className={`text-xs font-medium whitespace-nowrap relative after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:top-full after:mt-1 after:w-0 after:h-0.5 after:bg-primary after:transition-all after:duration-300 ${selectedCategory === cat.id ? "after:w-full font-semibold" : "group-hover:after:w-1/2"
                  }`}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              size="sm"
              className="rounded-full"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters} size="sm" className="rounded-full">
                Clear All
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-[160px] rounded-lg border-border/60">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
                <SelectItem value="date_new">Newest First</SelectItem>
                <SelectItem value="date_old">Oldest First</SelectItem>
                <SelectItem value="title_asc">Title: A-Z</SelectItem>
                <SelectItem value="title_desc">Title: Z-A</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="rounded border border-input w-4 h-4 cursor-pointer"
                checked={showSold}
                onChange={(e) => setShowSold(e.target.checked)}
              />
              Show sold items
            </label>
          </div>
        </div>

        {showFilters && (
          <div className="bg-card border border-border/60 rounded-xl p-6 mb-6 shadow-sm animate-scale-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="condition" className="block text-sm font-medium mb-2">
                  Condition
                </label>
                <select
                  id="condition"
                  value={selectedCondition}
                  onChange={(e) => setSelectedCondition(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Conditions</option>
                  <option value={ItemCondition.NEW}>New</option>
                  <option value={ItemCondition.LIKE_NEW}>Like New</option>
                  <option value={ItemCondition.GOOD}>Good</option>
                  <option value={ItemCondition.FAIR}>Fair</option>
                  <option value={ItemCondition.POOR}>Poor</option>
                </select>
              </div>

              <div>
                <label htmlFor="minPrice" className="block text-sm font-medium mb-2">
                  Min Price ($)
                </label>
                <Input
                  id="minPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Min"
                />
              </div>

              <div>
                <label htmlFor="maxPrice" className="block text-sm font-medium mb-2">
                  Max Price ($)
                </label>
                <Input
                  id="maxPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-1">Available Listings</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading..." : `${sortedItems?.length || 0} ${(sortedItems?.length || 0) === 1 ? "item" : "items"} found`}
            {hasActiveFilters && " (filtered)"}
            {sortBy !== "relevance" && ` • Sorted by ${sortBy.replace("_", " ")}`}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, index) => (
              <ListingCardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 animate-fade-in">
            <p className="text-base text-destructive mb-6">
              Error loading items: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : sortedItems && sortedItems.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No items found"
            description={hasActiveFilters ? "Try adjusting your search or filters to find what you're looking for." : "No items match your search."}
            actionLabel={hasActiveFilters ? "Clear Filters" : undefined}
            onAction={hasActiveFilters ? handleClearFilters : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedItems?.map((item, index) => (
              <div key={item.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                <ListingCard
                  id={item.id}
                  title={item.title}
                  price={item.price}
                  condition={item.condition}
                  category={item.category}
                  location={item.location}
                  imageUrl={item.item_url}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <ComparisonPopup />
    </div>
  );
}
