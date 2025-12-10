import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { createItem, uploadFile } from "@/lib/api";
import { ItemCategory, ItemCondition } from "@/types";
import { authStore } from "@/store/authStore";
import { Link } from "react-router-dom";
import { ImageCropper } from "@/components/ImageCropper";

export default function CreateItem() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    condition: ItemCondition.GOOD,
    category: ItemCategory.OTHER,
    location: "",
    is_negotiable: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const mutation = useMutation({
    mutationFn: createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      toast.success("Listing created successfully!");
      navigate("/my-items");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create listing");
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else if (name === "price") {
      setFormData({ ...formData, [name]: value });
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

    const reader = new FileReader();
    reader.onloadend = () => {
      setTempImage(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      // Reset input value so same file can be selected again if needed
      e.target.value = "";
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

  const handleCropComplete = async (croppedImageUrl: string) => {
    try {
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], "cropped_image.jpg", { type: "image/jpeg" });

      setSelectedFile(file);
      setImagePreview(croppedImageUrl);
      setShowCropper(false);
      setTempImage(null);
    } catch (error) {
      console.error("Error processing cropped image:", error);
      toast.error("Failed to process image");
    }
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setTempImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.description || !formData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!selectedFile) {
      toast.error("Please upload an item image");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    let imageUrl: string | undefined;

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

    mutation.mutate({
      title: formData.title,
      description: formData.description,
      price: price,
      condition: formData.condition,
      category: formData.category,
      location: formData.location || undefined,
      is_negotiable: formData.is_negotiable,
      item_url: imageUrl,
    });
  };

  if (!authStore.isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-lg text-muted-foreground mb-4">Please log in to create a listing.</p>
          <Link to="/login">
            <Button>Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-8">Create New Listing</h1>

        <Card>
          <CardHeader>
            <CardTitle>Item Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price ($) *</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
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
                  <Label htmlFor="condition">Condition *</Label>
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
                <Label htmlFor="location">Location (optional)</Label>
                <Input
                  id="location"
                  name="location"
                  type="text"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g., San Jose State University"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Item Image *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer relative ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="image"
                  />
                  {imagePreview ? (
                    <div className="relative flex flex-col items-center gap-4">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-h-[300px] rounded-md mx-auto shadow-sm"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedFile(null);
                          setImagePreview(null);
                        }}
                        className="z-10 relative"
                      >
                        Remove Image
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mb-4"
                      >
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                      <p className="text-lg font-medium mb-1">
                        {isDragging ? "Drop image here" : "Click to upload or drag and drop"}
                      </p>
                      <p className="text-sm">SVG, PNG, JPG or GIF (max. 5MB)</p>
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
                    onChange={handleChange}
                    className="rounded"
                  />
                  <span className="text-sm">Price is negotiable</span>
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={mutation.isPending || uploading}
                  className="flex-1"
                >
                  {(mutation.isPending || uploading) ? (uploading ? "Uploading..." : "Creating...") : "Create Listing"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>


      {
        showCropper && tempImage && (
          <ImageCropper
            image={tempImage}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
            aspectRatio={4 / 3}
          />
        )
      }
    </div >
  );
}
