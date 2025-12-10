import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import ListingCard from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Trash2 } from "lucide-react";
import { getItem } from "@/lib/api";
import { Item } from "@/types";
import { getFavorites, clearComparison } from "@/lib/utils";
import { toast } from "sonner";

export default function Favorites() {
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  useEffect(() => {
    const updateFavorites = () => {
      setFavoriteIds(getFavorites());
    };
    updateFavorites();
    const interval = setInterval(updateFavorites, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: items, isLoading, error } = useQuery<Item[]>({
    queryKey: ["favorites", favoriteIds],
    queryFn: async () => {
      const items = await Promise.all(
        favoriteIds.map(async (id) => {
          try {
            return await getItem(id);
          } catch {
            return null;
          }
        })
      );
      return items.filter((item): item is Item => item !== null);
    },
    enabled: favoriteIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-muted-foreground">Loading favorites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
              <Heart className="w-8 h-8 text-red-500 fill-red-500" />
              My Favorites
            </h1>
            <p className="text-muted-foreground">
              {favoriteIds.length} {favoriteIds.length === 1 ? "item" : "items"} saved
            </p>
          </div>
        </div>

        {error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive">Error loading favorites</p>
            </CardContent>
          </Card>
        ) : favoriteIds.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No favorites yet</CardTitle>
              <CardDescription>
                Start adding items to your favorites by clicking the heart icon on any item.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => window.location.href = "/"}>
                Browse Items
              </Button>
            </CardContent>
          </Card>
        ) : items && items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Some favorites are no longer available</CardTitle>
              <CardDescription>
                Some items may have been removed or are no longer available.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items?.map((item) => (
              <ListingCard
                key={item.id}
                id={item.id}
                title={item.title}
                price={item.price}
                condition={item.condition}
                category={item.category}
                location={item.location}
                imageUrl={item.item_url}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}


