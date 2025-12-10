import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    actionLink?: string;
    onAction?: () => void;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    actionLink,
    onAction,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in duration-500">
            <div className="bg-muted/50 p-6 rounded-full mb-6">
                {Icon && <Icon className="w-12 h-12 text-muted-foreground/50" />}
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-sm mb-8">{description}</p>

            {(actionLabel && (actionLink || onAction)) && (
                actionLink ? (
                    <Link to={actionLink}>
                        <Button size="lg" className="min-w-[150px]">
                            {actionLabel}
                        </Button>
                    </Link>
                ) : (
                    <Button size="lg" className="min-w-[150px]" onClick={onAction}>
                        {actionLabel}
                    </Button>
                )
            )}
        </div>
    );
}
