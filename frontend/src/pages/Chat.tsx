import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCategory, formatCondition, formatStatus } from "@/lib/utils";
import { 
  getConversations, 
  getMessages, 
  sendMessage, 
  getItem, 
  archiveConversation, 
  unarchiveConversation, 
  deleteConversation, 
  reportConversation,
  continueConversation,
  markConversationNotificationsRead,
} from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { authStore } from "@/store/authStore";
import { formatDistanceToNow, format } from "date-fns";
import { Send, MessageSquare, ChevronDown, ChevronUp, Package, MoreVertical, Archive, Trash2, Flag, ArchiveRestore, ShoppingCart, Star, CheckCircle2 } from "lucide-react";
import { BrowserNotifications } from "@/lib/notifications";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import confetti from "canvas-confetti";
import { sendPurchaseOffer, respondToOffer, rateUser, getTransactionRatings, getUserRatingSummary } from "@/lib/api";
import { Conversation, Message, Item, Transaction, RatingCreate, Rating } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Chat() {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(
    conversationId ? parseInt(conversationId) : null
  );
  const [messageText, setMessageText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [itemDetailsExpanded, setItemDetailsExpanded] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [counterOfferDialogOpen, setCounterOfferDialogOpen] = useState(false);
  const [counterPrice, setCounterPrice] = useState("");
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);
  const [conversationToReport, setConversationToReport] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showBannerMessage, setShowBannerMessage] = useState(false);
  const [userRating, setUserRating] = useState<Rating | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Request notification permission on mount
  useEffect(() => {
    BrowserNotifications.requestPermission().then((granted) => {
      if (granted) {
        console.log('✅ Browser notifications enabled');
      } else {
        console.log('❌ Browser notifications denied');
      }
    });
  }, []);

  // Get conversations (including archived)
  const { data: allConversations, isLoading: conversationsLoading, error: conversationsError } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getConversations(),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  // Log errors for debugging
  useEffect(() => {
    if (conversationsError) {
      console.error('Error loading conversations:', conversationsError);
      toast.error('Failed to load conversations. Please try refreshing the page.');
    }
  }, [conversationsError]);

  // Separate active and archived conversations (with fallback for missing status field)
  const conversations = allConversations?.filter((c) => !c.status || c.status === "active") || [];
  const archivedConversations = allConversations?.filter((c) => c.status === "archived") || [];

  // Get messages for selected conversation
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", selectedConversationId],
    queryFn: () => getMessages(selectedConversationId!),
    enabled: !!selectedConversationId,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  // Get selected conversation details
  const selectedConversation: Conversation | null =
    (allConversations || []).find((c) => c.id === selectedConversationId) || null;
  const selectedItemId = selectedConversation?.item_id ?? null;
  const otherUserId = selectedConversation?.other_user_id ?? null;
  const currentUserId = authStore.user?.user_id;
  const activeTransaction = transaction ?? selectedConversation?.transaction ?? null;
  const activeTransactionId =
    activeTransaction?.id ?? selectedConversation?.transaction_id ?? null;

  // Get item details if conversation is related to an item
  const { data: item } = useQuery({
    queryKey: ["item", selectedConversation?.item_id],
    queryFn: () => getItem(selectedConversation!.item_id!),
    enabled: !!selectedConversation?.item_id,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  // Get transaction ratings to check if user has already rated
  const { data: ratingsData } = useQuery({
    queryKey: ["transaction-ratings", activeTransactionId],
    queryFn: () => getTransactionRatings(activeTransactionId!),
    enabled: !!activeTransactionId,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  const { data: otherUserRatingSummary } = useQuery({
    queryKey: ["user-rating", otherUserId],
    queryFn: () => getUserRatingSummary(otherUserId!),
    enabled: !!otherUserId,
    refetchInterval: 2000, // Refetch every 2 seconds for instant updates
  });

  useEffect(() => {
    if (ratingsData?.ratings && currentUserId) {
      const existing = ratingsData.ratings.find((entry) => entry.rater_id === currentUserId) || null;
      setUserRating(existing);
    } else {
      setUserRating(null);
    }
  }, [ratingsData, currentUserId]);

  useEffect(() => {
    if (!ratingDialogOpen) {
      setRating(userRating?.rating ?? 0);
      setRatingComment(userRating?.comment ?? "");
    }
  }, [ratingDialogOpen, userRating]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Archive conversation mutation
  const archiveMutation = useMutation({
    mutationFn: archiveConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation archived");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to archive conversation");
    },
  });

  // Unarchive conversation mutation
  const unarchiveMutation = useMutation({
    mutationFn: unarchiveConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation unarchived");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unarchive conversation");
    },
  });

  // Delete conversation mutation
  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      if (selectedConversationId === conversationToDelete) {
        setSelectedConversationId(null);
      }
      toast.success("Conversation deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete conversation");
    },
  });

  // Report conversation mutation
  const reportMutation = useMutation({
    mutationFn: ({ conversationId, reason }: { conversationId: number; reason: string }) =>
      reportConversation(conversationId, reason),
    onSuccess: () => {
      setReportDialogOpen(false);
      setConversationToReport(null);
      setReportReason("");
      toast.success("Conversation reported");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to report conversation");
    },
  });

  // Send purchase offer mutation
  const sendOfferMutation = useMutation({
    mutationFn: ({ conversationId, salePrice }: { conversationId: number; salePrice: number }) =>
      sendPurchaseOffer(conversationId, { sale_price: salePrice }),
    onSuccess: () => {
      setSellDialogOpen(false);
      setSalePrice("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      toast.success("Offer sent!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send offer");
    },
  });

  // Respond to offer mutation
  const respondOfferMutation = useMutation({
    mutationFn: ({ conversationId, action, counterPrice }: { conversationId: number; action: "accept" | "reject" | "counter"; counterPrice?: number }) =>
      respondToOffer(conversationId, { action, counter_price: counterPrice }),
    onSuccess: (data) => {
      setOfferDialogOpen(false);
      setCounterOfferDialogOpen(false);
      setCounterPrice("");
      // Handle different response types
      if (data && "id" in data && "sale_price" in data) {
        // Transaction created (offer accepted) - show confetti for the person who accepted
        setTransaction(data);
        // Show confetti once per transaction using sessionStorage
        // Use user-specific key so both users can see confetti
        const transactionId = data.id || (data as any).transaction_id;
        if (transactionId && selectedConversationId) {
          const userId = authStore.user?.user_id;
          const confettiKey = `confetti-${selectedConversationId}-${transactionId}-${userId}`;
          const hasSeenConfetti = sessionStorage.getItem(confettiKey);
          
          if (!hasSeenConfetti) {
            setShowConfetti(true);
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
            setTimeout(() => {
              setShowConfetti(false);
              sessionStorage.setItem(confettiKey, "true");
            }, 5000);
          }
        }
        toast.success("Offer accepted! Transaction completed.");
        
        // The other party (who sent the offer) will receive item_sold WebSocket event
        // which will trigger their confetti and rating option
      } else if (data && ("success" in data || "message" in data)) {
        // Counter or reject response - these are valid responses, not errors
        toast.success((data as any).message || "Response sent");
      } else {
        toast.success("Response sent");
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["item", selectedConversation?.item_id] });
      queryClient.invalidateQueries({ queryKey: ["transaction-ratings"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to respond to offer");
    },
  });

  // Rate user mutation
  const rateMutation = useMutation({
    mutationFn: (data: RatingCreate) => rateUser(data),
    onSuccess: (updatedRating) => {
      setRatingDialogOpen(false);
      setUserRating(updatedRating);
      setRating(updatedRating.rating);
      setRatingComment(updatedRating.comment || "");
      toast.success("Rating submitted!");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeTransactionId) {
        queryClient.invalidateQueries({ queryKey: ["transaction-ratings", activeTransactionId] });
      }
      if (selectedConversation?.other_user_id) {
        queryClient.invalidateQueries({ queryKey: ["user-rating", selectedConversation.other_user_id] });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit rating");
    },
  });

  // Update timestamps every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Set up WebSocket listeners
  useEffect(() => {
    const user = authStore.user;
    const token = localStorage.getItem("access_token");

    if (user && token) {
      console.log("Connecting WebSocket for user:", user.user_id);
      wsClient.connect(user.user_id, token);

      const handleNewMessage = (data: Message) => {
        console.log("Received new message via WebSocket:", data);
        
        // Show browser notification only if:
        // 1. Message is from someone else
        // 2. User is not currently viewing this conversation
        // 3. Message is not already read
        if (data.sender_id !== user.user_id && 
            selectedConversationId !== data.conversation_id &&
            !data.is_read) {
          const senderName = data.sender_full_name || data.sender_username || "Someone";
          BrowserNotifications.showMessageNotification(
            senderName,
            data.content,
            data.conversation_id,
            (convId) => navigate(`/chat/${convId}`)
          );
        }
        
        // Optimistically append the message to the open conversation so it appears instantly
        if (data.conversation_id === selectedConversationId) {
          queryClient.setQueryData<Message[] | undefined>(["messages", data.conversation_id], (prev) => {
            if (!prev) {
              return prev;
            }
            const alreadyExists = prev.some((msg) => msg.id === data.id);
            if (alreadyExists) {
              return prev;
            }
            return [
              ...prev,
              {
                id: data.id,
                conversation_id: data.conversation_id,
                sender_id: data.sender_id,
                content: data.content,
                is_read: data.is_read,
                read_at: data.read_at,
                created_at: data.created_at,
                sender_username: data.sender_username,
                sender_full_name: data.sender_full_name,
              },
            ];
          });
        }

        // Update cached conversations immediately for last message + unread counts
        queryClient.setQueryData<Conversation[] | undefined>(["conversations"], (prev) => {
          if (!prev) {
            return prev;
          }
          return prev.map((conv) => {
            if (conv.id !== data.conversation_id) {
              return conv;
            }
            const isIncoming = data.sender_id !== user.user_id;
            return {
              ...conv,
              last_message_at: data.created_at,
              unread_count: isIncoming ? (conv.unread_count || 0) + 1 : conv.unread_count,
              last_message: {
                id: data.id,
                conversation_id: data.conversation_id,
                sender_id: data.sender_id,
                content: data.content,
                is_read: data.is_read,
                read_at: data.read_at,
                created_at: data.created_at,
                sender_username: data.sender_username,
                sender_full_name: data.sender_full_name,
              },
            };
          });
        });

        // Refetch messages and conversations to stay consistent with server
        queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      };

      const handleItemSold = (data: any) => {
        console.log("Item sold via WebSocket:", data);
        // Always invalidate immediately to refresh UI for both seller and buyer
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
        queryClient.invalidateQueries({ queryKey: ["item", data.item_id] });
        queryClient.invalidateQueries({ queryKey: ["transaction-ratings"] });
        
        // Set transaction from WebSocket data (for both seller and buyer)
        // This ensures transaction is available even if user isn't viewing the conversation
        const transactionPayload = data.transaction || {
          id: data.transaction_id,
          sale_price: data.sale_price,
          original_price: data.original_price,
          item_id: data.item_id,
          conversation_id: data.conversation_id,
        };
        const transactionId = transactionPayload?.id || data.transaction_id;

        if (transactionId) {
          queryClient.setQueryData<Conversation[] | undefined>(["conversations"], (prev) => {
            if (!prev) return prev;
            return prev.map((conv) => {
              if (conv.id !== data.conversation_id) {
                return conv;
              }
              return {
                ...conv,
                is_sold: true,
                is_ended: true,
                transaction_id: transactionId,
                transaction: transactionPayload || conv.transaction,
              };
            });
          });
        }
        
        // If viewing this conversation, set transaction and show confetti
        if (data.conversation_id === selectedConversationId) {
          if (transactionPayload && transactionPayload.id) {
            setTransaction(transactionPayload);
          }
          
          // Show confetti for BOTH buyer and seller, but only once per transaction
          const transactionId = transactionPayload?.id || data.transaction_id;
          if (transactionId) {
            // Use a user-specific key so both users can see confetti
            const userId = authStore.user?.user_id;
            const confettiKey = `confetti-${data.conversation_id}-${transactionId}-${userId}`;
            const hasSeenConfetti = sessionStorage.getItem(confettiKey);
            
            if (!hasSeenConfetti) {
              setShowConfetti(true);
              // Trigger confetti
              confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
              });
              setTimeout(() => {
                setShowConfetti(false);
                sessionStorage.setItem(confettiKey, "true");
              }, 5000);
            }
          }
        }
      };

      const handleConversationUpdated = (data: any) => {
        console.log("Conversation updated via WebSocket:", data);
        if (!data?.conversation_id) return;

        // Always invalidate conversations for instant updates
        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        if (data.conversation_id === selectedConversationId) {
          queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
          
          // If conversation was sold, update transaction state immediately
          if (data.is_sold && data.transaction_id) {
            // Invalidate to get fresh transaction data
            queryClient.invalidateQueries({ queryKey: ["transaction-ratings"] });
            // The item_sold WebSocket event will handle confetti and transaction setting
          }

          if (selectedItemId) {
            queryClient.invalidateQueries({ queryKey: ["item", selectedItemId] });
          }

          if (data.item_id) {
            queryClient.invalidateQueries({ queryKey: ["item", data.item_id] });
          }
        }
      };

      const handlePurchaseOffer = (data: any) => {
        console.log("Purchase offer via WebSocket:", data);
        // Immediately invalidate to get latest conversation data
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
        
        // Open dialog immediately if viewing this conversation
        // Don't wait for refetch - open it right away
        if (data.conversation_id === selectedConversationId) {
          setOfferDialogOpen(true);
        }
      };

      wsClient.on("message", handleNewMessage);
      wsClient.on("item_sold", handleItemSold);
      wsClient.on("conversation_updated", handleConversationUpdated);
      wsClient.on("purchase_offer", handlePurchaseOffer);

      return () => {
        wsClient.off("message", handleNewMessage);
        wsClient.off("item_sold", handleItemSold);
        wsClient.off("conversation_updated", handleConversationUpdated);
        wsClient.off("purchase_offer", handlePurchaseOffer);
      };
    }
  }, [queryClient, selectedConversationId, selectedItemId]);

  // Update selected conversation when conversationId param changes
  useEffect(() => {
    if (conversationId) {
      setSelectedConversationId(parseInt(conversationId));
    }
  }, [conversationId]);

  // Show banner message when conversation starts or is resumed
  useEffect(() => {
    if (selectedConversation && item && authStore.user) {
      // Show banner every time conversation is opened with an item
      // This covers: new chat, resumed chat, or contacting same seller for different item
      setShowBannerMessage(true);
      
      // Hide banner after 5 seconds
      const timer = setTimeout(() => {
        setShowBannerMessage(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    } else {
      setShowBannerMessage(false);
    }
  }, [selectedConversation?.id, item?.id]);

  // Mark conversation notifications as read when opening a conversation
  useEffect(() => {
    if (selectedConversationId) {
      markConversationNotificationsRead(selectedConversationId).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotificationCount"] });
    }
  }, [selectedConversationId, queryClient]);

  // Set transaction when conversation loads or updates
  useEffect(() => {
    if (selectedConversation?.transaction) {
      // Transaction object is available - use it
      setTransaction(selectedConversation.transaction);
    } else if (selectedConversation?.transaction_id && selectedConversation?.is_sold) {
      // If we have transaction_id but no transaction object, and conversation is sold,
      // the transaction will be loaded via the conversation query
      // Don't clear existing transaction if we have one
      // The transaction will be set when the conversation query refetches
    } else if (!selectedConversation?.is_sold) {
      // Only clear if conversation is not sold
      setTransaction(null);
    }
  }, [selectedConversation?.transaction, selectedConversation?.transaction_id, selectedConversation?.is_sold]);

  // Show offer dialog if there's a pending offer from the other user
  useEffect(() => {
    if (selectedConversation?.pending_offer_price && 
        selectedConversation.pending_offer_from_user_id !== currentUserId) {
      setOfferDialogOpen(true);
    }
  }, [selectedConversation?.pending_offer_price, selectedConversation?.pending_offer_from_user_id, currentUserId]);

  // Trigger confetti when opening a sold conversation (for both buyer and seller, but only once per user)
  useEffect(() => {
    const transactionId = activeTransaction?.id || selectedConversation?.transaction_id;
    if (selectedConversation?.is_sold && transactionId && !showConfetti && selectedConversationId) {
      // Use user-specific key so both users can see confetti when they open the conversation
      const userId = authStore.user?.user_id;
      const confettiKey = `confetti-${selectedConversation.id}-${transactionId}-${userId}`;
      const hasSeenConfetti = sessionStorage.getItem(confettiKey);
      
      // Show confetti for both buyer and seller, but only once per transaction per user
      if (!hasSeenConfetti) {
        setShowConfetti(true);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        setTimeout(() => {
          setShowConfetti(false);
          sessionStorage.setItem(confettiKey, "true");
        }, 5000);
      }
    }
  }, [activeTransaction?.id, selectedConversation?.is_sold, selectedConversation?.transaction_id, selectedConversation?.id, showConfetti, selectedConversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversationId) return;

    sendMessageMutation.mutate({
      conversation_id: selectedConversationId,
      content: messageText.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleArchive = (conversationId: number, currentStatus?: string) => {
    if (currentStatus === "archived") {
      unarchiveMutation.mutate(conversationId);
    } else {
      archiveMutation.mutate(conversationId);
    }
  };

  const handleDeleteClick = (conversationId: number) => {
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const handleReportClick = (conversationId: number) => {
    setConversationToReport(conversationId);
    setReportDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (conversationToDelete) {
      deleteMutation.mutate(conversationToDelete);
    }
  };

  const handleReportConfirm = () => {
    if (conversationToReport && reportReason.trim()) {
      reportMutation.mutate({
        conversationId: conversationToReport,
        reason: reportReason.trim(),
      });
    } else {
      toast.error("Please provide a reason for reporting");
    }
  };


  const renderConversationItem = (conversation: Conversation, isArchived: boolean = false) => (
    <div
      key={conversation.id}
      className={cn(
        "group relative",
        selectedConversationId === conversation.id && "bg-muted"
      )}
    >
      <button
        onClick={() => {
          setSelectedConversationId(conversation.id);
          navigate(`/chat/${conversation.id}`);
        }}
        className={cn(
          "w-full p-4 text-left hover:bg-muted/50 transition-colors",
          isArchived && "opacity-60"
        )}
      >
        <div className="flex items-start gap-3">
          <Avatar>
            {conversation.other_user_profile_picture_url ? (
              <AvatarImage src={conversation.other_user_profile_picture_url} alt={conversation.other_user_full_name} />
            ) : null}
            <AvatarFallback>
              {conversation.other_user_full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium truncate flex items-center gap-2">
                {conversation.other_user_full_name}
                {isArchived && <Archive className="w-3 h-3 text-muted-foreground" />}
              </p>
              {conversation.unread_count > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {conversation.unread_count}
                </span>
              )}
            </div>
            {conversation.last_message && (
              <>
                <p className="text-sm text-muted-foreground truncate">
                  {conversation.last_message.content}
                </p>
                <p className="text-xs text-muted-foreground mt-1" key={now}>
                  {formatDistanceToNow(new Date(conversation.last_message.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </>
            )}
          </div>
        </div>
      </button>
      {/* Options Menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleArchive(conversation.id, conversation.status)}>
              {conversation.status === "archived" ? (
                <>
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleReportClick(conversation.id)}>
              <Flag className="w-4 h-4 mr-2" />
              Report
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDeleteClick(conversation.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="bg-card rounded-lg border shadow-sm h-[calc(100vh-8rem)] flex">
          {/* Conversations List */}
          <div className="w-80 border-r flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Messages</h2>
            </div>
            <ScrollArea className="flex-1">
              {conversationsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading conversations...</div>
              ) : (conversations && conversations.length > 0) || (archivedConversations && archivedConversations.length > 0) ? (
                <div className="divide-y">
                  {/* Archived Conversations Section */}
                  {archivedConversations && archivedConversations.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-muted/30 sticky top-0 z-10">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                          <Archive className="w-3 h-3" />
                          Archived ({archivedConversations.length})
                        </p>
                      </div>
                      {archivedConversations.map((conversation) =>
                        renderConversationItem(conversation, true)
                      )}
                      {conversations && conversations.length > 0 && (
                        <div className="h-2 bg-muted/50" />
                      )}
                    </>
                  )}
                  
                  {/* Active Conversations */}
                  {conversations && conversations.length > 0 && (
                    <>
                      {archivedConversations && archivedConversations.length > 0 && (
                        <div className="px-4 py-2 bg-muted/30 sticky top-0 z-10">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Active
                          </p>
                        </div>
                      )}
                      {conversations.map((conversation) => renderConversationItem(conversation))}
                    </>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Window */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                <div className="border-b">
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage 
                          src={selectedConversation.other_user_profile_picture_url} 
                          alt={selectedConversation.other_user_full_name}
                        />
                        <AvatarFallback>
                          {selectedConversation.other_user_full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{selectedConversation.other_user_full_name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          @{selectedConversation.other_user_username}
                          {otherUserRatingSummary && (
                            otherUserRatingSummary.rating_count > 0 ? (
                              <span className="flex items-center gap-1 text-xs">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                {otherUserRatingSummary.average_rating?.toFixed(1)}
                                <span className="text-muted-foreground/70">
                                  ({otherUserRatingSummary.rating_count})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/80">No ratings yet</span>
                            )
                          )}
                        </p>
                      </div>
                    </div>
                    {/* Send Offer button - show for sellers if item exists and not sold, or for buyers if there's no pending offer */}
                    {item && !selectedConversation.is_sold && item.status?.toLowerCase() !== "sold" && (
                      (item.seller_id === currentUserId || 
                        // Buyer can send offers if there's no pending offer, or if they want to make a new offer (counter)
                        !selectedConversation.pending_offer_price || 
                        selectedConversation.pending_offer_from_user_id === currentUserId
                      ) && (
                        <Button
                          onClick={() => {
                            setSalePrice(item.price.toString());
                            setSellDialogOpen(true);
                          }}
                          className="flex items-center gap-2"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          {item.seller_id === currentUserId 
                            ? `Send Offer to ${selectedConversation.other_user_full_name.split(" ")[0]}`
                            : `Make Offer for ${item.title}`
                          }
                        </Button>
                      )
                    )}
                  </div>

                  {/* Banner Message - Show when conversation starts or is resumed */}
                  {showBannerMessage && item && authStore.user && selectedConversation && (
                    <div className="border-t bg-primary/5 p-3">
                      <p className="text-sm text-center">
                        <span className="font-medium">{authStore.user.full_name}</span> has messaged{" "}
                        <span className="font-medium">{selectedConversation.other_user_full_name}</span> for listing{" "}
                        <span className="font-medium">{item.title}</span>
                      </p>
                    </div>
                  )}

                  {/* Item Details Card - Collapsible */}
                  {item && (
                    <div className="border-t">
                      <button
                        onClick={() => setItemDetailsExpanded(!itemDetailsExpanded)}
                        className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <Package className="w-4 h-4" />
                          <span className="font-medium">Listing Details</span>
                        </div>
                        {itemDetailsExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {itemDetailsExpanded && (
                        <div className="p-3 bg-muted/30 border-t">
                          <div className="flex gap-3">
                            {item.item_url && (
                              <img
                                src={item.item_url}
                                alt={item.title}
                                className="w-16 h-16 object-cover rounded border"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{item.title}</h4>
                              <p className="text-lg font-bold text-primary">${item.price.toFixed(2)}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant={item.status === "available" ? "default" : "secondary"} className="text-xs">
                                  {formatStatus(item.status)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatCondition(item.condition)} • {formatCategory(item.category)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 p-4" ref={messagesContainerRef}>
                  <div className="flex flex-col gap-4">
                    {item && (
                      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span className="flex-1 h-px bg-border" />
                        <span className="text-foreground font-medium">
                          Regarding listing: <span className="text-primary normal-case">{item.title}</span>
                        </span>
                        <span className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    {messagesLoading ? (
                      <div className="text-center text-muted-foreground">Loading messages...</div>
                    ) : messages && messages.length > 0 ? (
                      <div className="space-y-4">
                        {messages.map((message, index) => {
                          const isOwn = message.sender_id === currentUserId;
                          const showSenderName = !isOwn && (
                            index === 0 || 
                            messages[index - 1].sender_id !== message.sender_id
                          );
                          const senderName = message.sender_full_name || message.sender_username || "Unknown";
                          
                          return (
                            <div
                              key={message.id}
                              className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
                            >
                              {showSenderName && (
                                <p className="text-xs text-muted-foreground mb-1 px-1">
                                  {senderName}
                                </p>
                              )}
                              <div
                                className={cn(
                                  "max-w-[70%] rounded-lg px-4 py-2",
                                  isOwn
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-foreground"
                                )}
                              >
                                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p
                                        key={now}
                                        className={cn(
                                          "text-xs mt-1 cursor-help",
                                          isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                                        )}
                                      >
                                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{format(new Date(message.created_at), "PPpp")}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground">No messages yet. Start the conversation!</div>
                    )}

                    {/* Sold Banner - Show for both seller and buyer */}
                    {selectedConversation.is_sold && (activeTransaction || selectedConversation.transaction_id || selectedConversation.transaction) && (
                      <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          <h3 className="font-semibold text-green-700 dark:text-green-400">Item Sold!</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          {item?.seller_id === currentUserId ? (
                            <>
                              <span>{item?.title} was sold to {selectedConversation.other_user_full_name} for ${(activeTransaction?.sale_price || selectedConversation.transaction?.sale_price)?.toFixed(2) || "N/A"}</span>
                            </>
                          ) : (
                            <>
                              <span>{selectedConversation.other_user_full_name} sold {item?.title} to you for ${(activeTransaction?.sale_price || selectedConversation.transaction?.sale_price)?.toFixed(2) || "N/A"}</span>
                              <Badge variant="secondary" className="text-xs">Sold to you</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Chat Ended Message */}
                    {selectedConversation.is_ended && (
                      <div className="p-4 bg-muted/50 border border-dashed rounded-lg text-center">
                        <p className="text-sm font-medium mb-2">Chat Ended</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          This conversation has ended. You may continue chatting if you wish.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!selectedConversationId) return;
                            try {
                              await continueConversation(selectedConversationId);
                              queryClient.invalidateQueries({ queryKey: ["conversations"] });
                              queryClient.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
                              toast.success("You can now continue chatting");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to continue chat");
                            }
                          }}
                        >
                          Continue Chat
                        </Button>
                      </div>
                    )}

                    {/* Rating Prompt - Show after sale below Chat Ended banner (for both buyer and seller) */}
                    {/* Show rating option if conversation is sold and user hasn't rated yet, or if they want to update their rating */}
                    {selectedConversation.is_sold && (activeTransaction || selectedConversation.transaction_id || selectedConversation.transaction) && activeTransactionId && (
                      <div className="p-4 border-t bg-muted/30">
                        <p className="text-sm font-medium mb-2">
                          {userRating ? "Update your rating" : "Rate your experience"} with {selectedConversation.other_user_full_name}
                        </p>
                        <div className="flex items-center gap-2 justify-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => {
                                setRating(star);
                                setRatingComment(userRating?.comment || "");
                                setRatingDialogOpen(true);
                              }}
                              className="text-2xl hover:scale-110 transition-transform"
                            >
                              <Star
                                className={cn(
                                  "w-6 h-6",
                                  star <= (rating || userRating?.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                                )}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t flex gap-2">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={selectedConversation.is_ended ? "This chat has ended" : "Type a message..."}
                    disabled={sendMessageMutation.isPending || selectedConversation.is_ended}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMessageMutation.isPending || selectedConversation.is_ended}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Select a conversation to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Conversation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this conversation for you. The other person will still be able to see it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Report Conversation Dialog */}
        <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Report Conversation</AlertDialogTitle>
              <AlertDialogDescription>
                Please provide a reason for reporting this conversation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Describe why you're reporting this conversation..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={4}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setReportReason("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReportConfirm}>Submit Report</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Offer Dialog */}
        <AlertDialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send Offer</AlertDialogTitle>
              <AlertDialogDescription>
                {item?.seller_id === currentUserId ? (
                  <>Send a purchase offer for <strong>{item?.title}</strong> to <strong>{selectedConversation?.other_user_full_name}</strong></>
                ) : (
                  <>Make an offer for <strong>{item?.title}</strong> to <strong>{selectedConversation?.other_user_full_name}</strong></>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Offer Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="Enter offer price"
                />
                {item && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Original price: ${item.price.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSalePrice("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!selectedConversationId || !salePrice || parseFloat(salePrice) <= 0) {
                    toast.error("Please enter a valid offer price");
                    return;
                  }
                  sendOfferMutation.mutate({
                    conversationId: selectedConversationId,
                    salePrice: parseFloat(salePrice),
                  });
                }}
                disabled={sendOfferMutation.isPending}
              >
                Send Offer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Offer Response Dialog (for both buyer and seller) */}
        <AlertDialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Purchase Offer</AlertDialogTitle>
              <AlertDialogDescription>
                {item?.seller_id === currentUserId ? (
                  // Seller viewing buyer's offer
                  <>{selectedConversation?.other_user_full_name} made an offer of <strong>${selectedConversation?.pending_offer_price?.toFixed(2)}</strong> for <strong>{item?.title}</strong></>
                ) : (
                  // Buyer viewing seller's offer
                  <>{selectedConversation?.other_user_full_name} offered to sell <strong>{item?.title}</strong> for <strong>${selectedConversation?.pending_offer_price?.toFixed(2)}</strong></>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              {item && (
                <p className="text-sm text-muted-foreground">
                  Original listing price: ${item.price.toFixed(2)}
                </p>
              )}
            </div>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                if (selectedConversationId) {
                  respondOfferMutation.mutate({
                    conversationId: selectedConversationId,
                    action: "reject"
                  });
                }
              }}>Reject</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  setOfferDialogOpen(false);
                  setCounterOfferDialogOpen(true);
                }}
              >
                Counter Offer
              </Button>
              <AlertDialogAction
                onClick={() => {
                  if (selectedConversationId) {
                    respondOfferMutation.mutate({
                      conversationId: selectedConversationId,
                      action: "accept"
                    });
                  }
                }}
                disabled={respondOfferMutation.isPending}
              >
                Accept Offer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Counter Offer Dialog */}
        <AlertDialog open={counterOfferDialogOpen} onOpenChange={setCounterOfferDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Counter Offer</AlertDialogTitle>
              <AlertDialogDescription>
                Make a counter offer for <strong>{item?.title}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Your Counter Offer</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={counterPrice}
                  onChange={(e) => setCounterPrice(e.target.value)}
                  placeholder="Enter counter offer price"
                />
                {item && selectedConversation?.pending_offer_price && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Original offer: ${selectedConversation.pending_offer_price.toFixed(2)} • Listing price: ${item.price.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCounterPrice("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!selectedConversationId || !counterPrice || parseFloat(counterPrice) <= 0) {
                    toast.error("Please enter a valid counter offer price");
                    return;
                  }
                  respondOfferMutation.mutate({
                    conversationId: selectedConversationId,
                    action: "counter",
                    counterPrice: parseFloat(counterPrice),
                  });
                }}
                disabled={respondOfferMutation.isPending}
              >
                Send Counter Offer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rating Dialog */}
        <AlertDialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rate Your Experience</AlertDialogTitle>
              <AlertDialogDescription>
                How would you rate your experience with {selectedConversation?.other_user_full_name}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="text-4xl hover:scale-110 transition-transform"
                  >
                    <Star
                      className={cn(
                        "w-10 h-10",
                        star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Comment (optional)</label>
                <Textarea
                  placeholder="Share your experience..."
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setRating(userRating?.rating ?? 0);
                  setRatingComment(userRating?.comment ?? "");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const transactionId = activeTransaction?.id || selectedConversation?.transaction_id;
                  if (!transactionId || !selectedConversation || rating === 0) {
                    toast.error("Please select a rating");
                    return;
                  }
                  const otherUserId = selectedConversation.user1_id === currentUserId 
                    ? selectedConversation.user2_id 
                    : selectedConversation.user1_id;
                  rateMutation.mutate({
                    transaction_id: transactionId,
                    rated_user_id: otherUserId,
                    rating: rating,
                    comment: ratingComment || undefined,
                  });
                }}
                disabled={rateMutation.isPending || rating === 0}
              >
                Submit Rating
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

