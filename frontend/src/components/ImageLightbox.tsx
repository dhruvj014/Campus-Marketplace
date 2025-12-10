import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, normalizeImageUrl } from "@/lib/utils";

interface ImageLightboxProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

export default function ImageLightbox({
  imageUrl,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: ImageLightboxProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-8 h-8" />
        </button>

        {hasPrevious && onPrevious && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrevious();
            }}
            className="absolute left-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {hasNext && onNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2"
            aria-label="Next image"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}

        <img
          src={normalizeImageUrl(imageUrl) || ''}
          alt="Full size"
          className="max-w-full max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}


