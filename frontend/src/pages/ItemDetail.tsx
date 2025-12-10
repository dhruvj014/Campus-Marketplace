import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import AdminNavbar from "@/components/AdminNavbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Trash2, Settings, AlertTriangle, MessageSquare } from "lucide-react";
import { getItem, updateItem, deleteItem, uploadFile, createConversation, getConversations, markItemIncomplete } from "@/lib/api";
import { authStore } from "@/store/authStore";
import ImageLightbox from "@/components/ImageLightbox";
import ReportSidebar from "@/components/ReportSidebar";
import { formatCategory, formatCondition, formatStatus, normalizeImageUrl } from "@/lib/utils";
import { Item, ItemCategory, ItemCondition, ItemStatus, UserRole } from "@/types";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const itemId = id ? parseInt(id) : 0;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ItemStatus>(ItemStatus.AVAILABLE);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [reportIncompleteDialogOpen, setReportIncompleteDialogOpen] = useState(false);
  const [reportType, setReportType] = useState<"incomplete_info" | "no_photos" | "inappropriate" | "other">("incomplete_info");
  const [reportDescription, setReportDescription] = useState("");
  
  // Check if user came from admin page
  const isAdmin = authStore.user?.role === UserRole.ADMIN;
  const cameFromAdmin = location.state?.fromAdmin === true;
  const reportId = location.state?.reportId as number | undefined;
  const [showReportSidebar, setShowReportSidebar] = useState(!!reportId);
  
  // Redirect admin to admin pages if not coming from admin (but allow if cameFromAdmin)
  useEffect(() => {
    if (isAdmin && !cameFromAdmin) {
      navigate(`/admin/listings?itemId=${itemId}`);
    }
  }, [isAdmin, cameFromAdmin, navigate, itemId]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: ItemCategory.OTHER,
    condition: ItemCondition.GOOD,
    location: "",
    is_negotiable: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId),
    enabled: !!itemId,
  });


  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title,
        description: item.description,
        price: item.price.toString(),
        category: item.category,
        condition: item.condition,
        location: item.location || "",
        is_negotiable: item.is_negotiable,
      });
      setImagePreview(item.item_url || null);
      setSelectedStatus(item.status);
    }
  }, [item]);

  // Open edit dialog if ?edit=true in URL
  useEffect(() => {
    if (searchParams.get("edit") === "true" && item) {
      setEditDialogOpen(true);
      // Remove edit param from URL
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("edit");
      const newSearch = newSearchParams.toString();
      navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [searchParams, item, navigate, location.pathname]); // searchParams is already included

  const updateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) => updateItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      toast.success("Listing updated successfully!");
      setEditDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update listing");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: ItemStatus }) =>
      updateItem(itemId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      toast.success("Status updated successfully!");
      setStatusDialogOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      toast.success("Listing deleted successfully!");
      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
      navigate("/my-items");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete listing");
    },
  });

  const reportIncompleteMutation = useMutation({
    mutationFn: ({ itemId, reportData }: { itemId: number; reportData: { report_type: string; description?: string } }) =>
      markItemIncomplete(itemId, reportData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      toast.success("Item reported successfully");
      setReportIncompleteDialogOpen(false);
      setReportType("incomplete_info");
      setReportDescription("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to report item");
    },
  });

  // Contact seller mutation
  const contactSellerMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["item", conversation.item_id] });
      navigate(`/chat/${conversation.id}`);
      toast.success("Opening chat with seller...");
    },
    onError: async (err: Error) => {
      // If conversation already exists, try to find it and navigate
      // Check for conversation with same seller (even if different item)
      try {
        const conversations = await getConversations();
        const existingConversation = conversations.find(
          (c) => (c.user1_id === item?.seller_id || c.user2_id === item?.seller_id)
        );
        if (existingConversation) {
          // Backend will update item_id and resume conversation if needed
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["item", item?.id] });
          navigate(`/chat/${existingConversation.id}`);
          toast.success("Opening conversation...");
        } else {
          toast.error(err.message || "Failed to start conversation");
        }
      } catch (error) {
        toast.error(err.message || "Failed to start conversation");
      }
    },
  });

  const handleContactSeller = () => {
    if (!item) return;
    contactSellerMutation.mutate({
      user2_id: item.seller_id,
      item_id: item.id,
    });
  };

  const resetForm = () => {
    if (item) {
      setFormData({
        title: item.title,
        description: item.description,
        price: item.price.toString(),
        category: item.category,
        condition: item.condition,
        location: item.location || "",
        is_negotiable: item.is_negotiable,
      });
      setImagePreview(item.item_url || null);
    }
    setSelectedFile(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    if (!formData.title || !formData.description || !formData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    let imageUrl: string | undefined = item.item_url;

    if (selectedFile) {
      setUploading(true);
      try {
        imageUrl = await uploadFile(selectedFile, "items");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to upload image");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    updateMutation.mutate({
      itemId: item.id,
      data: {
        title: formData.title,
        description: formData.description,
        price: price,
        condition: formData.condition,
        category: formData.category,
        location: formData.location || undefined,
        is_negotiable: formData.is_negotiable,
        item_url: imageUrl,
      },
    });
  };

  const handleStatusSubmit = () => {
    if (!item) return;
    statusMutation.mutate({ itemId: item.id, status: selectedStatus });
  };

  const handleDeleteConfirm = () => {
    if (!item) return;
    if (deleteConfirmText !== item.title) {
      toast.error("Listing name does not match. Please enter the exact name.");
      return;
    }
    deleteMutation.mutate(item.id);
  };

  const handleReportIncomplete = () => {
    if (!item) return;
    if (reportType === "other" && !reportDescription.trim()) {
      toast.error("Please provide a description for 'other' report type");
      return;
    }
    reportIncompleteMutation.mutate({
      itemId: item.id,
      reportData: {
        report_type: reportType,
        description: reportType === "other" ? reportDescription : undefined,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-muted-foreground">Loading item...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-destructive mb-4">
            Error loading item: {error instanceof Error ? error.message : "Item not found"}
          </p>
          <Link to="/">
            <Button>Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Check if current user is the owner
  const isOwner = authStore.user && item.seller_id === authStore.user.user_id;
  const canEdit = isOwner || isAdmin;

  const handleBackClick = () => {
    if (isAdmin && cameFromAdmin) {
      navigate('/admin/reports');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      {isAdmin && cameFromAdmin ? <AdminNavbar /> : <Navbar />}
      {showReportSidebar && reportId && (
        <ReportSidebar reportId={reportId} onClose={() => setShowReportSidebar(false)} />
      )}
      <main className={`container mx-auto px-4 py-8 ${showReportSidebar ? 'max-w-5xl' : 'max-w-6xl'}`}>
        <Button variant="ghost" className="mb-4" onClick={handleBackClick}>
          ← {isAdmin && cameFromAdmin ? "Back to reports" : "Back to listings"}
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            {item.item_url ? (
              <>
                <img
                  src={normalizeImageUrl(item.item_url) || ''}
                  alt={item.title}
                  className="w-full rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setLightboxOpen(true)}
                />
                <ImageLightbox
                  imageUrl={item.item_url}
                  isOpen={lightboxOpen}
                  onClose={() => setLightboxOpen(false)}
                />
              </>
            ) : (
              <div className="w-full aspect-square bg-muted rounded-lg border border-border flex items-center justify-center text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-foreground mb-4">{item.title}</h1>
            <div className="text-3xl font-bold text-primary mb-6">${item.price.toFixed(2)}</div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Status:</span>
                <Badge variant={item.status === "available" ? "default" : "secondary"}>
                  {formatStatus(item.status)}
                </Badge>
              </div>

              <div>
                <span className="font-semibold">Category:</span>{" "}
                {formatCategory(item.category)}
              </div>

              <div>
                <span className="font-semibold">Condition:</span>{" "}
                {formatCondition(item.condition)}
              </div>

              {item.location && (
                <div>
                  <span className="font-semibold">Location:</span> {item.location}
                </div>
              )}

              <div>
                <span className="font-semibold">Negotiable:</span> {item.is_negotiable ? "Yes" : "No"}
              </div>

              <div className="text-sm text-muted-foreground">
                <span className="font-semibold">Listed:</span> {format(new Date(item.created_at), "MMM d, yyyy")}
              </div>
            </div>

            {canEdit && (
              <div className="space-y-2 mb-6">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setStatusDialogOpen(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Modify Status
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Listing
                </Button>
                <Button
                  variant="destructive"
                  className="w-full justify-start"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Listing
                </Button>
              </div>
            )}

            {!canEdit && authStore.isAuthenticated && (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleContactSeller}
                  disabled={contactSellerMutation.isPending}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {contactSellerMutation.isPending ? "Opening chat..." : "Contact Seller"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setReportIncompleteDialogOpen(true)}
                >
                  Report as Incomplete
                </Button>
              </div>
            )}

            {!authStore.isAuthenticated && !canEdit && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Want to contact the seller?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Please log in to contact the seller about this item.
                  </p>
                  <Link to="/login">
                    <Button>Login</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{item.description}</p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify Status</DialogTitle>
            <DialogDescription>
              Change the status of "{item.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select
                value={selectedStatus}
                onValueChange={(value) => setSelectedStatus(value as ItemStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ItemStatus.AVAILABLE}>Available</SelectItem>
                  <SelectItem value={ItemStatus.RESERVED}>On Hold</SelectItem>
                  <SelectItem value={ItemStatus.SOLD}>Sold</SelectItem>
                  <SelectItem value={ItemStatus.INACTIVE}>Archive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Note: Archived items are hidden from public view but remain visible to you and admins.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatusSubmit} disabled={statusMutation.isPending}>
              {statusMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Listing</DialogTitle>
            <DialogDescription>Update the details of your listing</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  name="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-location">Location (Optional)</Label>
                <Input
                  id="edit-location"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value as ItemCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ItemCategory.TEXTBOOKS}>Textbooks</SelectItem>
                    <SelectItem value={ItemCategory.ELECTRONICS}>Electronics</SelectItem>
                    <SelectItem value={ItemCategory.FURNITURE}>Furniture</SelectItem>
                    <SelectItem value={ItemCategory.CLOTHING}>Clothing</SelectItem>
                    <SelectItem value={ItemCategory.SPORTS_FITNESS}>Sports & Fitness</SelectItem>
                    <SelectItem value={ItemCategory.OTHER}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-condition">Condition</Label>
                <Select
                  value={formData.condition}
                  onValueChange={(value) => setFormData({ ...formData, condition: value as ItemCondition })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ItemCondition.NEW}>New</SelectItem>
                    <SelectItem value={ItemCondition.LIKE_NEW}>Like New</SelectItem>
                    <SelectItem value={ItemCondition.GOOD}>Good</SelectItem>
                    <SelectItem value={ItemCondition.FAIR}>Fair</SelectItem>
                    <SelectItem value={ItemCondition.POOR}>Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-image">Item Image (Optional)</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <div className="flex flex-col items-center gap-4">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-[200px] max-h-[200px] rounded-md border border-border"
                    />
                    <div className="flex gap-2">
                      <Input
                        id="edit-image"
                        name="image"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label htmlFor="edit-image">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <span className="cursor-pointer">Change Image</span>
                        </Button>
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(null);
                          setImagePreview(null);
                        }}
                      >
                        Remove Image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Input
                      id="edit-image"
                      name="image"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="edit-image" className="cursor-pointer w-full">
                      <div className="flex flex-col items-center py-4 text-muted-foreground">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mb-2"
                        >
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                        <p className="text-sm font-medium mb-1">
                          {isDragging ? "Drop image here" : "Click to upload or drag and drop"}
                        </p>
                        <p className="text-xs">SVG, PNG, JPG or GIF (max. 5MB)</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="is_negotiable"
                  checked={formData.is_negotiable}
                  onChange={handleInputChange}
                  className="rounded"
                />
                <span className="text-sm">Price is negotiable</span>
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending || uploading}>
                {(updateMutation.isPending || uploading) ? (uploading ? "Uploading..." : "Saving...") : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Listing
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your listing "{item.title}".
              <br />
              <br />
              <strong>To confirm, please type the listing name:</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder={item.title}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteConfirmText !== item.title || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Listing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Incomplete Dialog */}
      <AlertDialog open={reportIncompleteDialogOpen} onOpenChange={setReportIncompleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Report Listing</AlertDialogTitle>
            <AlertDialogDescription>
              Please select a reason for reporting this listing. This will notify the seller and admins.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-type">Reason</Label>
              <Select
                value={reportType}
                onValueChange={(value) => {
                  setReportType(value as "incomplete_info" | "no_photos" | "inappropriate" | "other");
                  if (value !== "other") {
                    setReportDescription("");
                  }
                }}
              >
                <SelectTrigger id="report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incomplete_info">Incomplete Information</SelectItem>
                  <SelectItem value="no_photos">No Photos</SelectItem>
                  <SelectItem value="inappropriate">Inappropriate Listing</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reportType === "other" && (
              <div className="space-y-2">
                <Label htmlFor="report-description">Additional Comments (Required)</Label>
                <Textarea
                  id="report-description"
                  placeholder="Please describe the issue..."
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={4}
                />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setReportType("incomplete_info");
                setReportDescription("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReportIncomplete}
              disabled={reportIncompleteMutation.isPending || (reportType === "other" && !reportDescription.trim())}
            >
              {reportIncompleteMutation.isPending ? "Reporting..." : "Report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}