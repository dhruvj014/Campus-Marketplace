import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListingCardSkeleton() {
    return (
        <Card className="overflow-hidden border-border/40 bg-card rounded-xl">
            <div className="aspect-[4/3] bg-muted/30 relative">
                <Skeleton className="h-full w-full" />
            </div>
            <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-6 w-1/3" />
                <div className="flex gap-2 mt-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                </div>
            </CardContent>
            <CardFooter className="px-4 pb-4 pt-0">
                <div className="flex items-center gap-2 w-full">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </CardFooter>
        </Card>
    );
}
