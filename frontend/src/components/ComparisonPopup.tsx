import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, X, ChevronUp, Trash2 } from "lucide-react";
import { getItem } from "@/lib/api";
import { Item } from "@/types";
import { getComparison, removeFromComparison, clearComparison, formatCategory, formatCondition, formatStatus } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface ComparisonPopupProps {
  onClose?: () => void;
}

export default function ComparisonPopup({ onClose }: ComparisonPopupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);

  useEffect(() => {
    const updateComparison = () => {
      setComparisonIds(getComparison());
    };
    updateComparison();
    const interval = setInterval(updateComparison, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
        if (onClose) onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isExpanded, onClose]);

  const { data: items, isLoading } = useQuery<Item[]>({
    queryKey: ["comparison", comparisonIds],
    queryFn: async () => {
      const items = await Promise.all(
        comparisonIds.map(async (id) => {
          try {
            return await getItem(id);
          } catch {
            return null;
          }
        })
      );
      return items.filter((item): item is Item => item !== null);
    },
    enabled: comparisonIds.length > 0,
  });

  const handleRemove = (itemId: number) => {
    removeFromComparison(itemId);
    toast.success("Removed from comparison");
  };

  const handleClear = () => {
    clearComparison();
    toast.success("Comparison cleared");
    setIsExpanded(false);
  };

  if (comparisonIds.length === 0) return null;

  return (
    <>
      {/* Collapsed Button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="fixed bottom-4 left-4 z-50 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center gap-2 group"
          aria-label="Open comparison"
        >
          <Scale className="w-5 h-5" />
          <span className="font-semibold">{comparisonIds.length}</span>
          <ChevronUp className="w-4 h-4 group-hover:translate-y-[-2px] transition-transform" />
        </button>
      )}

      {/* Expanded Popup */}
      {isExpanded && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur"
            onClick={() => {
              setIsExpanded(false);
              if (onClose) onClose();
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-5xl max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                  <Scale className="w-5 h-5" />
                  Compare Items ({comparisonIds.length}/3)
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleClear}
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsExpanded(false);
                      if (onClose) onClose();
                    }}
                    aria-label="Close comparison"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {isLoading ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading items...</p>
                  </div>
                ) : items && items.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">Some items are no longer available</p>
                    <Button variant="outline" onClick={handleClear}>
                      Clear Comparison
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Compact View */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items?.map((item) => (
                        <Card key={item.id} className="relative overflow-hidden border-border/60">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 z-10 h-7 w-7 p-0 bg-background/80 backdrop-blur hover:bg-background"
                            onClick={() => handleRemove(item.id)}
                            aria-label="Remove from comparison"
                          >
                            <X className="w-3 h-3" />
                          </Button>

                          <div className="w-full h-36 bg-gradient-to-br from-primary/5 to-accent/10 flex items-center justify-center">
                            {item.item_url ? (
                              <img
                                src={item.item_url}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-sm text-muted-foreground">No image</span>
                            )}
                          </div>

                          <CardContent className="p-4 space-y-3">
                            <Link to={`/items/${item.id}`} className="hover:underline block">
                              <h3 className="font-semibold text-base line-clamp-2">{item.title}</h3>
                            </Link>
                            <p className="text-xl font-bold text-primary">
                              ${item.price.toFixed(2)}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary" className="text-xs">
                                {formatCategory(item.category)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {formatCondition(item.condition)}
                              </Badge>
                            </div>
                            <Link to={`/items/${item.id}`}>
                              <Button size="sm" className="w-full mt-2">
                                View Details
                              </Button>
                            </Link>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Comparison Table (if 2+ items) */}
                    {items && items.length >= 2 && (
                      <div className="mt-6 border-t pt-4">
                        <h3 className="font-semibold mb-3">Side-by-Side Comparison</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2 font-semibold">Feature</th>
                                {items.map((item) => (
                                  <th key={item.id} className="text-center p-2 font-semibold min-w-[120px]">
                                    {item.title.substring(0, 20)}...
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b">
                                <td className="p-2 font-medium">Price</td>
                                {items.map((item) => (
                                  <td key={item.id} className="p-2 text-center">
                                    <span className="font-bold text-primary">${item.price.toFixed(2)}</span>
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium">Category</td>
                                {items.map((item) => (
                                  <td key={item.id} className="p-2 text-center">
                                    <Badge variant="secondary" className="text-xs">
                                      {formatCategory(item.category)}
                                    </Badge>
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium">Condition</td>
                                {items.map((item) => (
                                  <td key={item.id} className="p-2 text-center">
                                    <Badge variant="outline" className="text-xs">
                                      {formatCondition(item.condition)}
                                    </Badge>
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b">
                                <td className="p-2 font-medium">Status</td>
                                {items.map((item) => (
                                  <td key={item.id} className="p-2 text-center">
                                    <Badge variant={item.status === "available" ? "default" : "secondary"} className="text-xs">
                                      {formatStatus(item.status)}
                                    </Badge>
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="p-2 font-medium">Location</td>
                                {items.map((item) => (
                                  <td key={item.id} className="p-2 text-center text-xs text-muted-foreground">
                                    {item.location || "N/A"}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

