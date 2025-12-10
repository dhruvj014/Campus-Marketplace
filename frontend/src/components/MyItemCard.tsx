import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Item, ItemStatus } from "@/types";
import { formatCategory, formatCondition, normalizeImageUrl } from "@/lib/utils";

interface MyItemCardProps {
  item: Item;
}

const MyItemCard = ({ item }: MyItemCardProps) => {
  const getStatusColor = (status: ItemStatus) => {
    switch (status) {
      case ItemStatus.AVAILABLE:
        return "default";
      case ItemStatus.SOLD:
        return "secondary";
      case ItemStatus.RESERVED:
        return "outline";
      case ItemStatus.INACTIVE:
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: ItemStatus) => {
    switch (status) {
      case ItemStatus.AVAILABLE:
        return "Available";
      case ItemStatus.SOLD:
        return "Sold";
      case ItemStatus.RESERVED:
        return "On Hold";
      case ItemStatus.INACTIVE:
        return "Archived";
      default:
        return status;
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-elegant transition-all duration-300 border-border/50">
      <Link to={`/items/${item.id}`} className="block">
        <div className="aspect-square bg-gradient-to-br from-primary/5 to-accent/5 overflow-hidden">
          {item.item_url ? (
            <img
              src={normalizeImageUrl(item.item_url) || ''}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>
      </Link>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link to={`/items/${item.id}`} className="flex-1">
            <h3 className="font-semibold text-lg truncate text-card-foreground hover:underline">
              {item.title}
            </h3>
          </Link>
        </div>
        <p className="text-2xl font-bold text-primary mt-1">${item.price.toFixed(2)}</p>
        <div className="flex gap-2 mt-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            {formatCategory(item.category)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {formatCondition(item.condition)}
          </Badge>
          <Badge variant={getStatusColor(item.status)} className="text-xs">
            {getStatusLabel(item.status)}
          </Badge>
        </div>
        {item.location && (
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 mr-1" />
            {item.location}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MyItemCard;

