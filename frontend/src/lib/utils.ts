import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Debounce function for input delays
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Theme management
export const getTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const setTheme = (theme: 'light' | 'dark') => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('theme', theme);
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};


// Favorites management
export const getFavorites = (): number[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('favorites');
  return stored ? JSON.parse(stored) : [];
};

export const toggleFavorite = (itemId: number): boolean => {
  if (typeof window === 'undefined') return false;
  const favorites = getFavorites();
  const isFavorite = favorites.includes(itemId);
  if (isFavorite) {
    const updated = favorites.filter(id => id !== itemId);
    localStorage.setItem('favorites', JSON.stringify(updated));
    return false;
  } else {
    favorites.push(itemId);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    return true;
  }
};

export const isFavorite = (itemId: number): boolean => {
  return getFavorites().includes(itemId);
};

// Comparison management
export const getComparison = (): number[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('comparison');
  return stored ? JSON.parse(stored) : [];
};

export const addToComparison = (itemId: number): boolean => {
  if (typeof window === 'undefined') return false;
  const comparison = getComparison();
  if (comparison.includes(itemId)) return false;
  if (comparison.length >= 3) return false; // Max 3 items
  comparison.push(itemId);
  localStorage.setItem('comparison', JSON.stringify(comparison));
  return true;
};

export const toggleComparison = (itemId: number): boolean => {
  if (typeof window === 'undefined') return false;
  const comparison = getComparison();
  const isInComparison = comparison.includes(itemId);
  if (isInComparison) {
    removeFromComparison(itemId);
    return false;
  } else {
    if (comparison.length >= 3) return false; // Max 3 items
    comparison.push(itemId);
    localStorage.setItem('comparison', JSON.stringify(comparison));
    return true;
  }
};

export const removeFromComparison = (itemId: number) => {
  if (typeof window === 'undefined') return;
  const comparison = getComparison();
  const updated = comparison.filter(id => id !== itemId);
  localStorage.setItem('comparison', JSON.stringify(updated));
};

export const clearComparison = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('comparison');
};

// Search history
export const getSearchHistory = (): string[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('searchHistory');
  return stored ? JSON.parse(stored) : [];
};

export const addToSearchHistory = (query: string) => {
  if (typeof window === 'undefined' || !query.trim()) return;
  const history = getSearchHistory();
  const filtered = history.filter(q => q.toLowerCase() !== query.toLowerCase());
  const updated = [query, ...filtered].slice(0, 10); // Keep last 10
  localStorage.setItem('searchHistory', JSON.stringify(updated));
};

export const clearSearchHistory = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('searchHistory');
};

// Formatting utilities for display
export const formatCategory = (category: string): string => {
  // Replace underscores with spaces and convert to title case
  return category
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const formatCondition = (condition: string): string => {
  // Replace underscores with spaces and convert to title case
  return condition
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const formatStatus = (status: string): string => {
  // Convert to title case
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Image URL normalization - converts relative paths to S3 URLs
export const normalizeImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  
  // If already a full S3 URL (contains amazonaws.com), return as-is
  if (url.includes('amazonaws.com')) {
    return url;
  }
  
  // If already a full URL (http:// or https://) but not S3, return as-is
  // (might be a CDN or other external URL)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's a relative path, convert to S3 URL
  // Extract S3 key from relative path (handles /uploads/uploads/user_2/file.jpg)
  let s3Key = url.startsWith('/') ? url.substring(1) : url;
  if (s3Key.startsWith('uploads/')) {
    s3Key = s3Key.substring(8); // Remove 'uploads/' prefix
  }
  
  // Get S3 bucket info from environment or construct URL
  // Format: https://bucket-name.s3.region.amazonaws.com/key
  const s3Bucket = import.meta.env.VITE_S3_BUCKET_NAME;
  const s3Region = import.meta.env.VITE_S3_REGION || 'us-east-1';
  
  if (s3Bucket) {
    return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${s3Key}`;
  }
  
  // Fallback: if we can't construct S3 URL, try to get it from backend
  // For now, return the original URL and let the browser handle it
  // The backend should be returning proper S3 URLs for new uploads
  return url;
};

