import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Send, X, Bot, User, Minus } from "lucide-react";
import { aiSearchItems } from "@/lib/api";
import { Item } from "@/types";
import ListingCard from "./ListingCard";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { cn } from "@/lib/utils";

interface AISearchProps {
    onResults?: (items: Item[]) => void;
    className?: string;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    items?: Item[];
    timestamp: Date;
    isError?: boolean; // Flag to indicate error messages
    extractionMethod?: string; // "Groq AI", "Fallback (Rate Limited)", etc.
}

const STORAGE_KEY_MESSAGES = "ai_chat_messages";
const STORAGE_KEY_CONTEXT = "ai_chat_context";
const STORAGE_KEY_IS_OPEN = "ai_chat_is_open";

// Helper to load messages from localStorage
const loadMessagesFromStorage = (): ChatMessage[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_MESSAGES);
        console.log('loadMessagesFromStorage: Reading from localStorage, stored:', stored ? `exists (${stored.length} chars)` : 'null');
        if (stored) {
            const parsed = JSON.parse(stored);
            console.log('loadMessagesFromStorage: Parsed', parsed.length, 'messages from storage:', parsed.map((m: any) => m.id));
            // Convert timestamp strings back to Date objects
            const messages = parsed.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
            }));
            // Only return welcome message if we have NO messages (not even welcome)
            if (messages.length === 0) {
                console.log('loadMessagesFromStorage: No messages in storage, returning welcome message');
                return [
                    {
                        id: "welcome",
                        role: "assistant",
                        content: "Hi! I'm your AI shopping assistant. Tell me what you're looking for and I'll help you find it! 🛍️",
                        timestamp: new Date(),
                    },
                ];
            }
            console.log('loadMessagesFromStorage: Returning', messages.length, 'messages from storage');
            return messages;
        } else {
            console.log('loadMessagesFromStorage: No stored messages, returning welcome message');
        }
    } catch (error) {
        console.error("Failed to load messages from storage:", error);
    }
    // Only return welcome message if localStorage is empty or has error
    console.log('loadMessagesFromStorage: Returning default welcome message');
    return [
        {
            id: "welcome",
            role: "assistant",
            content: "Hi! I'm your AI shopping assistant. Tell me what you're looking for and I'll help you find it! 🛍️",
            timestamp: new Date(),
        },
    ];
};

// Helper to load context from localStorage
const loadContextFromStorage = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_CONTEXT);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error("Failed to load context from storage:", error);
    }
    return null;
};

export default function AISearch({ onResults, className = "" }: AISearchProps) {
    const location = useLocation();
    const [query, setQuery] = useState("");
    const [currentSearchQuery, setCurrentSearchQuery] = useState("");
    const [processedQueries, setProcessedQueries] = useState<Set<string>>(new Set());
    const [searchContext, setSearchContext] = useState<{
        product_names?: string[]  // Changed from keywords to product_names
        category?: string
        condition?: string
        min_price?: number
        max_price?: number
    } | null>(loadContextFromStorage());
    const [currentResults, setCurrentResults] = useState<Item[]>([]); // Store current search results
    // Initialize messages from localStorage only once on mount
    // Use a ref to track if we've already initialized to prevent re-initialization
    const initializedRef = useRef(false);
    // Use a ref to track the last known auth state to avoid false positives in logout detection
    const lastAuthStateRef = useRef<{ token: string | null; authenticated: boolean } | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        if (initializedRef.current) {
            console.warn('AISearch: WARNING - useState initializer called multiple times! This should not happen.');
            // If we're being re-initialized, try to preserve existing messages from localStorage
            const existing = loadMessagesFromStorage();
            console.warn('AISearch: Re-initializing with', existing.length, 'messages from storage');
            return existing;
        }
        initializedRef.current = true;
        const loaded = loadMessagesFromStorage();
        console.log('AISearch: Initializing messages from storage (first time), count:', loaded.length, 'loaded:', loaded.map(m => m.id));
        return loaded;
    });
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Check if we're on an admin page or auth pages - hide completely on both
    // Also hide if user is admin (they shouldn't see AI assistant)
    const isAdminPage = location.pathname.startsWith("/admin");
    const isAuthPage = location.pathname.startsWith("/login") || location.pathname.startsWith("/signup");
    const isAdmin = authStore.user?.role === UserRole.ADMIN;

    // Load saved state from localStorage, default to open if not on admin/auth pages
    const loadIsOpenState = () => {
        if (isAdminPage || isAuthPage || isAdmin) {
            return false;
        }
        try {
            const saved = localStorage.getItem(STORAGE_KEY_IS_OPEN);
            if (saved !== null) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error("Failed to load AI chat open state:", error);
        }
        return true; // Default to open
    };

    const [isOpen, setIsOpen] = useState(loadIsOpenState);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Save isOpen state to localStorage whenever it changes
    useEffect(() => {
        if (!isAdminPage && !isAuthPage && !isAdmin) {
            try {
                localStorage.setItem(STORAGE_KEY_IS_OPEN, JSON.stringify(isOpen));
            } catch (error) {
                console.error("Failed to save AI chat open state:", error);
            }
        }
    }, [isOpen, isAdminPage, isAuthPage, isAdmin]);

    // Update isOpen when navigating between admin and non-admin pages
    useEffect(() => {
        const isCurrentlyAdminPage = location.pathname.startsWith("/admin");
        const isCurrentlyAuthPage = location.pathname.startsWith("/login") || location.pathname.startsWith("/signup");
        const isCurrentlyAdmin = authStore.user?.role === UserRole.ADMIN;
        if (isCurrentlyAdminPage || isCurrentlyAuthPage || isCurrentlyAdmin) {
            setIsOpen(false);
        } else {
            // Restore saved state when navigating to non-admin pages
            const saved = localStorage.getItem(STORAGE_KEY_IS_OPEN);
            if (saved !== null) {
                try {
                    setIsOpen(JSON.parse(saved));
                } catch (error) {
                    setIsOpen(true);
                }
            } else {
                setIsOpen(true);
            }
        }
    }, [location.pathname, authStore.user?.role]);
    // Clear chat when user logs out or session expires
    useEffect(() => {
        const clearChatState = () => {
            console.log('AISearch: Clearing chat state due to logout');
            const welcomeMessage: ChatMessage = {
                id: "welcome",
                role: "assistant",
                content: "Hi! I'm your AI shopping assistant. Tell me what you're looking for and I'll help you find it! 🛍️",
                timestamp: new Date(),
            };
            setMessages([welcomeMessage]);
            setSearchContext(null);
            setCurrentResults([]);
            setCurrentSearchQuery("");
            setProcessedQueries(new Set());
        };

        // Check on mount if user is logged out
        const token = localStorage.getItem('access_token');
        if (!token && !authStore.isAuthenticated) {
            // User is logged out - clear chat
            clearChatState();
        }

        // Listen for storage events (when logout clears localStorage in other tabs)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'access_token' && e.newValue === null) {
                console.log('AISearch: Storage event detected - access_token removed');
                clearChatState();
            }
        };

        window.addEventListener('storage', handleStorageChange);

        // Check periodically for same-tab logout (when authStore changes)
        // Initialize last auth state on first run
        if (lastAuthStateRef.current === null) {
            const initialToken = localStorage.getItem('access_token');
            lastAuthStateRef.current = { token: initialToken, authenticated: authStore.isAuthenticated };
        }

        const interval = setInterval(() => {
            const currentToken = localStorage.getItem('access_token');
            const isAuthenticated = authStore.isAuthenticated;
            const lastState = lastAuthStateRef.current;

            // Only clear if:
            // 1. User WAS authenticated before (had token)
            // 2. User is NOW logged out (no token AND not authenticated)
            // 3. This is a CHANGE from authenticated to logged out (not just initial state)
            const wasAuthenticated = lastState && (lastState.token !== null || lastState.authenticated);
            const isNowLoggedOut = !currentToken && !isAuthenticated;
            const authStateChanged = wasAuthenticated && isNowLoggedOut;

            // Update last known state
            lastAuthStateRef.current = { token: currentToken, authenticated: isAuthenticated };

            // Only clear if we detect an actual logout (state change from authenticated to logged out)
            if (authStateChanged) {
                console.log('AISearch: Detected logout (was authenticated, now logged out), clearing chat');
                // Use a function to get current messages length to avoid stale closure
                setMessages((currentMessages) => {
                    if (currentMessages.length > 1) {
                        const welcomeMessage: ChatMessage = {
                            id: "welcome",
                            role: "assistant",
                            content: "Hi! I'm your AI shopping assistant. Tell me what you're looking for and I'll help you find it! 🛍️",
                            timestamp: new Date(),
                        };
                        return [welcomeMessage];
                    }
                    return currentMessages;
                });
                setSearchContext(null);
                setCurrentResults([]);
                setCurrentSearchQuery("");
                setProcessedQueries(new Set());
            }
        }, 2000); // Check every 2 seconds (less frequent)

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, []); // Only run once on mount - don't re-run when messages change

    useEffect(() => {
        if (!isOpen) {
            setShowClearConfirm(false);
        }
    }, [isOpen]);

    // Debug: Log when component mounts/unmounts
    useEffect(() => {
        console.log('AISearch: Component mounted, messages count:', messages.length);
        return () => {
            console.log('AISearch: Component unmounting, messages count:', messages.length);
        };
    }, []);

    // Debug: Log whenever messages change
    useEffect(() => {
        console.log('AISearch: Messages state changed, count:', messages.length, 'message IDs:', messages.map(m => m.id));
    }, [messages]);

    // Debug: Log when component mounts/unmounts
    useEffect(() => {
        console.log('AISearch: Component mounted, messages count:', messages.length);
        return () => {
            console.log('AISearch: Component unmounting, messages count:', messages.length);
        };
    }, []);

    // Debug: Log whenever messages change
    useEffect(() => {
        console.log('AISearch: Messages state changed, count:', messages.length, 'messages:', messages.map(m => ({ id: m.id, role: m.role, content: m.content.substring(0, 30) })));
    }, [messages]);

    const { data: searchResult, isLoading, error } = useQuery<{ items: Item[], extractedCriteria?: any, filtersRelaxed?: string[], requestedCondition?: string, requestedPrice?: { min_price?: number, max_price?: number }, requestedCategory?: string, extractionMethod?: string }>({
        queryKey: ["ai-search", currentSearchQuery],
        queryFn: async () => {
            if (!currentSearchQuery.trim()) {
                return { items: [] };
            }
            console.log('AISearch: Making API call with query:', currentSearchQuery, 'context:', searchContext);
            try {
                const result = await aiSearchItems({
                    query: currentSearchQuery.trim(),
                    context: searchContext || undefined,
                });
                console.log('AISearch: API call result:', result);
                return result;
            } catch (err) {
                console.error('AISearch: API call error:', err);
                throw err;
            }
        },
        enabled: !!currentSearchQuery.trim(),
        retry: 1,
    });

    const items = searchResult?.items || [];
    console.log('AISearch: Current state - items:', items.length, 'isLoading:', isLoading, 'error:', error, 'searchResult:', searchResult);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const prevMessagesLengthRef = useRef(messages.length);
    const prevIsLoadingRef = useRef(isLoading);

    useEffect(() => {
        // Only scroll if:
        // 1. A new message was added (messages length increased)
        // 2. Loading state changed from true to false (search completed)
        const messagesLengthChanged = messages.length !== prevMessagesLengthRef.current;
        const loadingFinished = prevIsLoadingRef.current && !isLoading;

        if (messagesLengthChanged || loadingFinished) {
            scrollToBottom();
        }

        prevMessagesLengthRef.current = messages.length;
        prevIsLoadingRef.current = isLoading;
    }, [messages, isLoading]);

    // Handle errors - add error message to chat
    useEffect(() => {
        if (error && currentSearchQuery && !processedQueries.has(`error-${currentSearchQuery}`)) {
            // Mark this error as processed
            setProcessedQueries((prev) => new Set(prev).add(`error-${currentSearchQuery}`));

            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                role: "assistant",
                content: error instanceof Error
                    ? `Sorry, I encountered an error: ${error.message}`
                    : "Sorry, I encountered an error while searching. Please try again.",
                timestamp: new Date(),
                isError: true,
            };

            setMessages((prev) => {
                const updated = [...prev, errorMessage];
                // Persist to localStorage
                try {
                    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updated));
                } catch (err) {
                    console.error("Failed to save messages to storage:", err);
                }
                return updated;
            });
        }
    }, [error, currentSearchQuery, processedQueries]);

    useEffect(() => {
        // Only process if we have a query, search is complete (not loading), and haven't processed this query yet
        // Process if we have results OR if there's an error (error handling is done separately)
        if (currentSearchQuery && !isLoading && !processedQueries.has(currentSearchQuery) && (searchResult !== undefined || error)) {
            console.log('AISearch: Processing results for query:', currentSearchQuery, 'items:', items.length, 'searchResult:', searchResult, 'error:', error);

            // Mark this query as processed
            setProcessedQueries((prev) => new Set(prev).add(currentSearchQuery));

            let content: string;
            if (items.length === 0) {
                content = "I couldn't find any items matching your description. Try rephrasing your search or being more specific.";
            } else if (searchResult?.filtersRelaxed && searchResult.filtersRelaxed.length > 0) {
                // Some filters were relaxed - show message explaining this
                const filterMessages: string[] = [];

                if (searchResult.filtersRelaxed.includes("condition") && searchResult.requestedCondition) {
                    const conditionMap: Record<string, string> = {
                        "good": "used",
                        "fair": "used",
                        "poor": "used",
                        "new": "new",
                        "like_new": "like new"
                    };
                    const conditionText = conditionMap[searchResult.requestedCondition] || searchResult.requestedCondition;
                    filterMessages.push(`${conditionText} condition`);
                }

                if (searchResult.filtersRelaxed.includes("price") && searchResult.requestedPrice) {
                    const priceParts: string[] = [];
                    if (searchResult.requestedPrice.min_price) {
                        priceParts.push(`above $${searchResult.requestedPrice.min_price}`);
                    }
                    if (searchResult.requestedPrice.max_price) {
                        priceParts.push(`under $${searchResult.requestedPrice.max_price}`);
                    }
                    if (priceParts.length > 0) {
                        filterMessages.push(priceParts.join(" and "));
                    }
                }

                if (searchResult.filtersRelaxed.includes("category") && searchResult.requestedCategory) {
                    const categoryText = searchResult.requestedCategory.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
                    filterMessages.push(`${categoryText} category`);
                }

                if (filterMessages.length > 0) {
                    const filterText = filterMessages.length === 1
                        ? filterMessages[0]
                        : filterMessages.slice(0, -1).join(", ") + " and " + filterMessages[filterMessages.length - 1];
                    content = `I couldn't find any items matching your ${filterText} filter${filterMessages.length > 1 ? "s" : ""}, but here are all the items I found:`;
                } else {
                    content = `I found ${items.length} ${items.length === 1 ? "item" : "items"} matching your search!`;
                }
            } else {
                // Backend AI search already filtered results, so show them
                content = `I found ${items.length} ${items.length === 1 ? "item" : "items"} matching your search!`;
            }

            const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: content,
                items: items,
                timestamp: new Date(),
                extractionMethod: searchResult?.extractionMethod,
            };

            setMessages((prev) => {
                const updated = [...prev, assistantMessage];
                // Persist to localStorage
                try {
                    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updated));
                } catch (error) {
                    console.error("Failed to save messages to storage:", error);
                }
                return updated;
            });

            // Update context from backend-extracted criteria (more accurate than frontend extraction)
            // Check if query has reference words (ones, those, them, it) - if not, update context
            const referenceWords = ["ones", "those", "them", "it", "these", "that", "this"];
            const queryLower = currentSearchQuery.toLowerCase();
            const hasReference = referenceWords.some(ref => queryLower.includes(ref));

            // Use extracted criteria from backend if available, otherwise keep existing context
            if (searchResult?.extractedCriteria) {
                const extracted = searchResult.extractedCriteria;
                // Merge with existing context - new values override, but keep old values if new ones are null
                const newContext = {
                    product_names: extracted.product_names && extracted.product_names.length > 0
                        ? extracted.product_names
                        : (searchContext?.product_names || []),
                    category: extracted.category || searchContext?.category,
                    condition: extracted.condition || searchContext?.condition,
                    min_price: extracted.min_price !== null && extracted.min_price !== undefined
                        ? extracted.min_price
                        : searchContext?.min_price,
                    max_price: extracted.max_price !== null && extracted.max_price !== undefined
                        ? extracted.max_price
                        : searchContext?.max_price,
                };

                // Only update context if this is not a reference query (reference queries should keep context)
                if (!hasReference) {
                    setSearchContext(newContext);
                    // Persist context to localStorage
                    try {
                        localStorage.setItem(STORAGE_KEY_CONTEXT, JSON.stringify(newContext));
                    } catch (error) {
                        console.error("Failed to save context to storage:", error);
                    }
                }
            } else if (!hasReference) {
                // Fallback: basic extraction if backend didn't return criteria
                const stopWords = new Set(["a", "an", "the", "i", "want", "need", "looking", "for", "under", "over", "above", "below", "less", "more", "than", "dollars", "dollar", "$", "with", "cost", "price", "show", "find", "get"]);
                const words = currentSearchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

                // Extract price info if present
                const pricePatterns = [
                    /(?:cost|price|under|below|less|than)\s*\$?(\d+)/i,
                    />\s*\$?(\d+)/i,
                    /(?:over|above|more|than)\s*\$?(\d+)/i,
                ];
                let minPrice: number | undefined = undefined;
                let maxPrice: number | undefined = undefined;

                for (const pattern of pricePatterns) {
                    const match = currentSearchQuery.match(pattern);
                    if (match) {
                        const price = parseFloat(match[1]);
                        if (pattern.source.includes("under") || pattern.source.includes("below") || pattern.source.includes("less") || pattern.source.includes(">")) {
                            maxPrice = price;
                        } else {
                            minPrice = price;
                        }
                    }
                }

                // Update context with extracted info
                const newContext = {
                    product_names: words.length > 0 ? words : (searchContext?.product_names || []),
                    min_price: minPrice || searchContext?.min_price,
                    max_price: maxPrice || searchContext?.max_price,
                    category: searchContext?.category,
                    condition: searchContext?.condition,
                };
                setSearchContext(newContext);
                // Persist context to localStorage
                try {
                    localStorage.setItem(STORAGE_KEY_CONTEXT, JSON.stringify(newContext));
                } catch (error) {
                    console.error("Failed to save context to storage:", error);
                }
            }
            // If hasReference, keep existing context (already set from previous search)

            // Store current results
            setCurrentResults(items);

            if (onResults) {
                onResults(items);
            }
        }
    }, [searchResult, isLoading, currentSearchQuery, processedQueries, items, onResults]);

    // Helper function to detect gratitude/thanks messages
    const isGratitudeMessage = (queryText: string): boolean => {
        const queryLower = queryText.toLowerCase().trim();

        // Exclude if it contains search intent keywords
        const searchIntentKeywords = [
            "looking for", "looking", "find", "search", "show", "want", "need", "buy",
            "racket", "rackets", "tennis", "glove", "gloves", "laptop", "phone",
            "textbook", "book", "shoes", "bag", "bike", "car", "calculator",
            "price", "cost", "under", "below", "over", "above", "condition"
        ];

        // If it contains search intent, it's not gratitude
        if (searchIntentKeywords.some(keyword => queryLower.includes(keyword))) {
            return false;
        }

        // Only match if it's clearly just gratitude (short messages with gratitude phrases)
        const gratitudePhrases = [
            "thanks", "thank you", "thank", "thx", "ty", "appreciate it", "appreciate",
            "great", "awesome", "perfect", "cool", "nice", "good", "okay", "ok", "sure",
            "sounds good", "that works", "that's great", "that's perfect"
        ];

        // Must be short and contain gratitude phrase
        const hasGratitudePhrase = gratitudePhrases.some(phrase => queryLower.includes(phrase));
        const isShort = queryLower.length < 50;
        const wordCount = queryText.split(/\s+/).length;

        // Only treat as gratitude if it's short, has gratitude phrase, and doesn't have search intent
        return hasGratitudePhrase && isShort && wordCount <= 5;
    };

    // Helper function to generate friendly responses
    const getFriendlyResponse = (): string => {
        const responses = [
            "You're welcome! Happy to help! 😊",
            "No problem! Let me know if you need anything else!",
            "Glad I could help! Feel free to ask if you need anything else!",
            "You're welcome! Is there anything else you're looking for?",
            "Happy to help! Don't hesitate to ask if you need anything else!",
            "No problem at all! Let me know if you need help finding anything else!",
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    };

    // Helper function to check if results actually match the query
    const checkResultsMatchQuery = (items: Item[], query: string): boolean => {
        if (items.length === 0) return false;

        // If we have items from the backend, they're already filtered by AI search
        // So we should trust the backend results and show them
        // The backend AI has already done the matching, so return true
        return true;
    };

    // Helper function to detect if query is filter-only (no product keywords)
    const isFilterOnlyQuery = (queryText: string, hasExistingResults: boolean): boolean => {
        if (!hasExistingResults) return false;

        const queryLower = queryText.toLowerCase();
        // Filter keywords
        const filterKeywords = ["price", "cost", "under", "below", "over", "above", "less", "more", "than",
            "condition", "new", "used", "like new", "good", "fair", "poor",
            "category", "filter", "show", "only"];
        // Product keywords that would indicate a new search
        const productKeywords = ["racket", "rackets", "tennis", "glove", "gloves", "laptop", "phone",
            "textbook", "book", "shoes", "bag", "bike", "car", "calculator"];

        // Check if query contains product keywords
        const hasProductKeyword = productKeywords.some(keyword => queryLower.includes(keyword));

        // Check if query is mostly filter-related
        const filterWordCount = filterKeywords.filter(keyword => queryLower.includes(keyword)).length;
        const totalWords = queryText.split(/\s+/).length;

        // If it has product keywords, it's not filter-only
        if (hasProductKeyword) return false;

        // If it's mostly filter words or has price/condition mentions, it's filter-only
        return filterWordCount > 0 || /\d+/.test(queryText);
    };

    const handleSend = () => {
        const trimmedQuery = query.trim();
        console.log('AISearch: handleSend called with query:', trimmedQuery, 'isLoading:', isLoading);
        if (!trimmedQuery || isLoading) {
            console.log('AISearch: handleSend early return - empty query or loading');
            return;
        }

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: trimmedQuery,
            timestamp: new Date(),
        };

        console.log('AISearch: Adding user message:', userMessage);
        console.log('AISearch: Current messages before update:', messages);
        // Use functional update to ensure we have the latest state
        setMessages((prev) => {
            console.log('AISearch: setMessages callback - prev length:', prev.length, 'prev messages:', prev.map(m => m.id));
            const updated = [...prev, userMessage];
            console.log('AISearch: Updated messages array, length:', updated.length, 'updated messages:', updated.map(m => m.id));
            // Persist to localStorage immediately
            try {
                const serialized = JSON.stringify(updated);
                localStorage.setItem(STORAGE_KEY_MESSAGES, serialized);
                console.log('AISearch: Saved to localStorage, verifying...');
                // Verify it was saved
                const verify = localStorage.getItem(STORAGE_KEY_MESSAGES);
                if (verify) {
                    const parsed = JSON.parse(verify);
                    console.log('AISearch: Verified localStorage has', parsed.length, 'messages');
                } else {
                    console.error('AISearch: ERROR - localStorage save failed!');
                }
            } catch (error) {
                console.error("Failed to save messages to storage:", error);
            }
            return updated;
        });
        // Use setTimeout to ensure state update happens after render
        setTimeout(() => {
            console.log('AISearch: Query cleared, current query state:', query);
        }, 0);
        setQuery("");

        // Check if this is a gratitude message
        if (isGratitudeMessage(trimmedQuery)) {
            // Add friendly response
            const friendlyMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: getFriendlyResponse(),
                timestamp: new Date(),
            };

            setMessages((prev) => {
                const updated = [...prev, friendlyMessage];
                try {
                    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updated));
                } catch (error) {
                    console.error("Failed to save messages to storage:", error);
                }
                return updated;
            });
            return; // Don't process as a search query
        }

        // Check if this is a filter-only query with existing results
        // Only check if we have existing results, otherwise treat as new search
        const hasExistingResults = currentResults.length > 0;
        if (hasExistingResults && isFilterOnlyQuery(trimmedQuery, true)) {
            // Extract filter criteria from query
            const queryLower = trimmedQuery.toLowerCase();
            let minPrice: number | undefined = undefined;
            let maxPrice: number | undefined = undefined;
            let condition: string | undefined = undefined;

            // Extract price filters
            const pricePatterns = [
                /(?:price|cost|under|below|less|than)\s*\$?(\d+)/i,
                />\s*\$?(\d+)/i,
                /(?:over|above|more|than)\s*\$?(\d+)/i,
                /between\s*\$?(\d+)\s*(?:and|-)\s*\$?(\d+)/i,
            ];

            for (const pattern of pricePatterns) {
                const match = trimmedQuery.match(pattern);
                if (match) {
                    if (match[2]) {
                        // Between pattern
                        minPrice = parseFloat(match[1]);
                        maxPrice = parseFloat(match[2]);
                    } else {
                        const price = parseFloat(match[1]);
                        if (pattern.source.includes("under") || pattern.source.includes("below") ||
                            pattern.source.includes("less") || pattern.source.includes(">")) {
                            maxPrice = price;
                        } else {
                            minPrice = price;
                        }
                    }
                }
            }

            // Extract condition
            const conditionPatterns = [
                { pattern: /\blike\s*new\b/i, value: "like_new" },
                { pattern: /\bnew\b/i, value: "new" },
                { pattern: /\bgood\b/i, value: "good" },
                { pattern: /\bfair\b/i, value: "fair" },
                { pattern: /\bpoor\b/i, value: "poor" },
            ];

            for (const { pattern, value } of conditionPatterns) {
                if (pattern.test(trimmedQuery)) {
                    condition = value;
                    break;
                }
            }

            // Filter existing results
            let filtered = [...currentResults];

            if (maxPrice !== undefined) {
                filtered = filtered.filter(item => item.price <= maxPrice);
            }
            if (minPrice !== undefined) {
                filtered = filtered.filter(item => item.price >= minPrice);
            }
            if (condition) {
                // Hierarchical condition filtering
                const conditionOrder: Record<string, number> = {
                    "new": 0,
                    "like_new": 1,
                    "good": 2,
                    "fair": 3,
                    "poor": 4,
                };
                const requestedLevel = conditionOrder[condition] ?? 999;
                filtered = filtered.filter(item => {
                    const itemLevel = conditionOrder[item.condition] ?? 999;
                    return itemLevel <= requestedLevel;
                });
            }

            // Update results
            setCurrentResults(filtered);

            // Add assistant message with filtered results
            const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: filtered.length > 0
                    ? `I found ${filtered.length} ${filtered.length === 1 ? "item" : "items"} matching your filter!`
                    : "No items match your filter criteria. Try adjusting your filters.",
                items: filtered,
                timestamp: new Date(),
            };

            setMessages((prev) => {
                const updated = [...prev, assistantMessage];
                try {
                    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updated));
                } catch (error) {
                    console.error("Failed to save messages to storage:", error);
                }
                return updated;
            });

            if (onResults) {
                onResults(filtered);
            }

            // Update context with new filters
            const newContext = {
                ...searchContext,
                product_names: searchContext?.product_names || [],  // Keep product_names from context
                min_price: minPrice || searchContext?.min_price,
                max_price: maxPrice || searchContext?.max_price,
                condition: condition || searchContext?.condition,
            };
            setSearchContext(newContext);
            try {
                localStorage.setItem(STORAGE_KEY_CONTEXT, JSON.stringify(newContext));
            } catch (error) {
                console.error("Failed to save context to storage:", error);
            }
        } else {
            // Set the search query which will trigger the API query automatically
            // This handles new product searches (not filter-only queries)
            // Clear processed queries to allow re-searching
            setProcessedQueries((prev) => {
                const newSet = new Set(prev);
                newSet.delete(trimmedQuery); // Remove if it was previously processed
                return newSet;
            });
            setCurrentSearchQuery(trimmedQuery);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            handleSend();
        }
    };

    const clearChat = () => {
        const welcomeMessage = [{
            id: "welcome",
            role: "assistant" as const,
            content: "Hi! I'm your AI shopping assistant. Tell me what you're looking for and I'll help you find it! 🛍️",
            timestamp: new Date(),
        }];
        setMessages(welcomeMessage);
        setQuery("");
        setSearchContext(null);
        setCurrentResults([]); // Clear current results
        // Clear localStorage
        try {
            localStorage.removeItem(STORAGE_KEY_MESSAGES);
            localStorage.removeItem(STORAGE_KEY_CONTEXT);
        } catch (error) {
            console.error("Failed to clear storage:", error);
        }
        if (onResults) {
            onResults([]);
        }
    };

    // Don't render on auth pages, admin pages, or for admin users
    if (isAuthPage || isAdminPage || isAdmin) {
        return null;
    }

    console.log('AISearch Render: isOpen=', isOpen, 'messages=', messages.length, 'messages array:', messages);

    return (
        <div className={cn("fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none", className)}>
            {isOpen && (
                <Card className="pointer-events-auto w-[calc(100vw-2rem)] sm:w-[360px] lg:w-[380px] max-h-[80vh] flex flex-col border border-border/60 shadow-2xl rounded-2xl bg-background/95 backdrop-blur-lg">
                    <CardHeader className="flex-shrink-0 border-b px-4 py-3 bg-background/80">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
                                    <Sparkles className="h-5 w-5 text-purple-500" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">AI Shopping Assistant</CardTitle>
                                    <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                                        Ask anything about campus listings
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 1 && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowClearConfirm(true)}
                                            className="h-8 px-2 text-xs"
                                            title="Clear chat history"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            <span className="ml-1 hidden sm:inline">Clear</span>
                                        </Button>
                                        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Clear Chat</DialogTitle>
                                                    <DialogDescription>
                                                        Are you sure you want to clear the chat? This will delete all your conversation history and cannot be undone.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <DialogFooter>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setShowClearConfirm(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        onClick={() => {
                                                            clearChat();
                                                            setShowClearConfirm(false);
                                                        }}
                                                    >
                                                        Clear Chat
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Minimize AI assistant"
                                >
                                    <Minus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                        {/* Chat Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/60">
                            {messages.length === 0 && (
                                <div className="text-center text-muted-foreground py-8">
                                    No messages yet. Start a conversation!
                                </div>
                            )}
                            {messages.map((message) => {
                                console.log('Rendering message:', message.id, message.role, message.content.substring(0, 50));
                                return (
                                    <div
                                        key={message.id}
                                        className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        {message.role === "assistant" && (
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center relative">
                                                <Bot className="h-4 w-4 text-purple-500" />
                                                {message.extractionMethod && (
                                                    <div className="absolute -top-1 -right-1">
                                                        {message.extractionMethod.includes("Groq") || message.extractionMethod.includes("OpenAI") ? (
                                                            <div className="relative">
                                                                <Sparkles className="h-3 w-3 text-purple-500 animate-pulse" />
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <Sparkles className="h-2 w-2 text-purple-300" />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500" title="Fallback mode" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div
                                            className={`flex flex-col gap-2 max-w-[80%] ${message.role === "user" ? "items-end" : "items-start"
                                                }`}
                                        >
                                            <div
                                                className={`rounded-xl px-3 py-2 ${message.role === "user"
                                                    ? "bg-blue-500 text-white"
                                                    : message.isError
                                                        ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                                                        : "bg-muted text-foreground"
                                                    }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <p className="m-0 whitespace-pre-wrap text-sm flex-1">{message.content}</p>
                                                    {message.extractionMethod && message.role === "assistant" && (
                                                        <div className="flex-shrink-0 mt-0.5" title={message.extractionMethod}>
                                                            {message.extractionMethod.includes("Groq") || message.extractionMethod.includes("OpenAI") ? (
                                                                <Sparkles className="h-3 w-3 text-purple-500" />
                                                            ) : (
                                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {message.items && message.items.length > 0 && (
                                                <div className="w-full space-y-3 mt-2">
                                                    <Badge variant="secondary" className="gap-1">
                                                        <Sparkles className="h-3 w-3" />
                                                        {message.items.length} {message.items.length === 1 ? "result" : "results"}
                                                    </Badge>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        {message.items.map((item) => (
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
                                                </div>
                                            )}

                                            {message.items && message.items.length === 0 && (
                                                <div className="text-xs text-muted-foreground italic">
                                                    Try rephrasing your search or being more specific.
                                                </div>
                                            )}
                                        </div>

                                        {message.role === "user" && (
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <User className="h-4 w-4 text-primary" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {isLoading && (
                                <div className="flex gap-3 justify-start">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                        <Bot className="h-4 w-4 text-purple-500" />
                                    </div>
                                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">Searching...</span>
                                        </div>
                                    </div>
                                </div>
                            )}


                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="flex-shrink-0 border-t p-4 bg-background/80">
                            <div className="flex gap-2">
                                <Input
                                    ref={inputRef}
                                    placeholder="Describe what you're looking for..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    disabled={isLoading}
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={!query.trim() || isLoading}
                                    size="icon"
                                    className="shrink-0"
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                Press Enter to send • Shift+Enter for new line
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!isOpen && (
                <Button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="pointer-events-auto rounded-full shadow-lg gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Ask AI Assistant</span>
                    <span className="sm:hidden text-sm">Ask AI</span>
                </Button>
            )}
        </div>
    );
}
