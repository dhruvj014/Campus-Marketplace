import { useState, useEffect } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { Item } from "@/types";
import { format } from "date-fns";
import { isFavorite, toggleFavorite, toggleComparison, getComparison, cn, formatCategory, formatCondition, normalizeImageUrl } from "@/lib/utils";
import { toast } from "sonner";

interface ListingCardProps {
  id: number;
  title: string;
  price: number;
  condition: string;
  category: string;
  location?: string;
  imageUrl?: string;
  description?: string;
  createdAt?: string;
}

const ListingCard = ({ title, price, condition, category, location, imageUrl, id }: ListingCardProps) => {
  const [favorited, setFavorited] = useState(false);
  const [inComparison, setInComparison] = useState(false);

  useEffect(() => {
    const updateState = () => {
      setFavorited(isFavorite(id));
      setInComparison(getComparison().includes(id));
    };
    updateState();
    const interval = setInterval(updateState, 500);
    return () => clearInterval(interval);
  }, [id]);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFavorite(id);
    setFavorited(newState);
    toast.success(newState ? "Added to favorites" : "Removed from favorites");
  };

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasAdded = toggleComparison(id);
    const nowInComparison = getComparison().includes(id);
    setInComparison(nowInComparison);
    if (wasAdded) {
      toast.success("Added to comparison");
    } else if (nowInComparison === false && getComparison().length >= 3) {
      // This shouldn't happen, but handle edge case
      toast.error("Maximum 3 items can be compared");
    } else {
      toast.success("Removed from comparison");
    }
  };

  return (
    <Link to={`/items/${id}`} className="block">
      <Card className="overflow-hidden hover-lift cursor-pointer group border-border/40 relative bg-card rounded-xl transition-all duration-200">
        <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-white/90 backdrop-blur-sm hover:bg-white rounded-full shadow-sm"
            onClick={handleFavoriteClick}
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`w-4 h-4 transition-all duration-200 ${favorited ? "fill-primary text-primary" : "text-foreground/70"}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-full transition-all duration-200 border",
              inComparison
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-white/90 backdrop-blur-sm hover:bg-white border-border/40 shadow-sm"
            )}
            onClick={handleCompareClick}
            aria-pressed={inComparison}
            aria-label={inComparison ? "Remove from comparison" : "Add to comparison"}
          >
            <Scale className={cn("w-4 h-4", inComparison && "fill-current")} />
          </Button>
        </div>
        <div className="aspect-square bg-muted/30 overflow-hidden rounded-t-xl">
          {imageUrl ? (
            <img
              src={normalizeImageUrl(imageUrl)}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/20">
              <span className="text-sm">No image</span>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-medium text-base truncate text-card-foreground mb-1">{title}</h3>
          <p className="text-lg font-semibold text-foreground">${price.toFixed(2)}</p>
          <div className="flex gap-1.5 mt-2">
            <Badge variant="secondary" className="text-xs font-normal px-2 py-0.5 bg-muted text-muted-foreground">
              {formatCategory(category)}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal px-2 py-0.5 border-border/60">
              {formatCondition(condition)}
            </Badge>
          </div>
        </CardContent>
        {location && (
          <CardFooter className="px-4 pb-4 pt-0">
            <div className="flex items-center text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 mr-1" />
              <span className="truncate">{location}</span>
            </div>
          </CardFooter>
        )}
      </Card>
    </Link>
  );
};

export default ListingCard;

