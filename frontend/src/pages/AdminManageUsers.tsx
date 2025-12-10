import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminNavbar from "@/components/AdminNavbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Trash2, UserCheck, ShoppingBag, Edit, Eye, EyeOff, Key, Shield } from "lucide-react";
import { getAllUsers, getSellers, deleteUser, resetUserPassword, verifyAdminSecurityAnswer, updateAdminSecurityAnswer } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole, User, Seller } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AdminManageUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "sellers">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<User | Seller | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  
  // Admin self-modification states
  const [securityVerifyDialogOpen, setSecurityVerifyDialogOpen] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [showSecurityAnswer, setShowSecurityAnswer] = useState(false);
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(false);
  const [securityAnswerDialogOpen, setSecurityAnswerDialogOpen] = useState(false);
  const [newSecurityAnswer, setNewSecurityAnswer] = useState("");
  const [confirmSecurityAnswer, setConfirmSecurityAnswer] = useState("");
  const [showNewSecurityAnswer, setShowNewSecurityAnswer] = useState(false);
  const [showConfirmSecurityAnswer, setShowConfirmSecurityAnswer] = useState(false);

  // Check if user is admin
  useEffect(() => {
    if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const { data: allUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: getAllUsers,
    enabled: authStore.isAuthenticated && authStore.user?.role === UserRole.ADMIN && activeTab === "all",
  });

  const { data: sellers, isLoading: loadingSellers } = useQuery({
    queryKey: ["adminSellers"],
    queryFn: getSellers,
    enabled: authStore.isAuthenticated && authStore.user?.role === UserRole.ADMIN && activeTab === "sellers",
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["adminSellers"] });
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete user");
    },
  });

  const passwordResetMutation = useMutation({
    mutationFn: ({ userId, passwordData }: { userId: number; passwordData: { new_password: string; confirm_password: string } }) =>
      resetUserPassword(userId, passwordData),
    onSuccess: (data, variables) => {
      const username = userToReset?.username || "User";
      setSuccessMessage(`${username} password updated!`);
      setPasswordDialogOpen(false);
      setChoiceDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setUserToReset(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
      
      toast.success(`Password updated for ${username}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reset password");
    },
  });

  const usersToDisplay = activeTab === "all" ? allUsers : sellers;
  const isLoading = activeTab === "all" ? loadingUsers : loadingSellers;

  const filteredUsers = usersToDisplay?.filter((user) => {
    const matchesSearch =
      !searchTerm ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id);
    }
  };

  const handleModifyPassword = (user: User | Seller) => {
    setUserToReset(user);
    
    // Only allow admin to modify their own account, require security question verification
    if (user.id === authStore.user?.user_id && user.role === UserRole.ADMIN) {
      setSecurityVerifyDialogOpen(true);
      setSecurityAnswer("");
      setShowSecurityAnswer(false);
    }
  };

  const securityVerifyMutation = useMutation({
    mutationFn: ({ userId, answer }: { userId: number; answer: string }) =>
      verifyAdminSecurityAnswer(userId, { answer }),
    onSuccess: () => {
      setSecurityVerifyDialogOpen(false);
      setChoiceDialogOpen(true);
      setSecurityAnswer("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Incorrect security answer");
    },
  });

  const securityAnswerUpdateMutation = useMutation({
    mutationFn: ({ userId, securityData }: { userId: number; securityData: { new_answer: string; confirm_answer: string } }) =>
      updateAdminSecurityAnswer(userId, securityData),
    onSuccess: (data, variables) => {
      const username = userToReset?.username || "User";
      setSuccessMessage(`${username} security answer updated!`);
      setSecurityAnswerDialogOpen(false);
      setNewSecurityAnswer("");
      setConfirmSecurityAnswer("");
      setChoiceDialogOpen(false);
      setUserToReset(null);
      
      setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
      
      toast.success(`Security answer updated for ${username}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update security answer");
    },
  });

  const handleSecurityVerify = () => {
    if (!userToReset || !securityAnswer.trim()) {
      toast.error("Please enter the security answer");
      return;
    }

    securityVerifyMutation.mutate({
      userId: userToReset.id,
      answer: securityAnswer,
    });
  };

  const handlePasswordReset = () => {
    if (!userToReset) return;

    // Validate passwords
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in both password fields");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    passwordResetMutation.mutate({
      userId: userToReset.id,
      passwordData: {
        new_password: newPassword,
        confirm_password: confirmPassword,
      },
    });
  };

  const handleSecurityAnswerReset = () => {
    if (!userToReset) return;

    // Validate security answers
    if (!newSecurityAnswer || !confirmSecurityAnswer) {
      toast.error("Please fill in both security answer fields");
      return;
    }

    if (newSecurityAnswer.length < 3) {
      toast.error("Security answer must be at least 3 characters long");
      return;
    }

    if (newSecurityAnswer !== confirmSecurityAnswer) {
      toast.error("Security answers do not match");
      return;
    }

    securityAnswerUpdateMutation.mutate({
      userId: userToReset.id,
      securityData: {
        new_answer: newSecurityAnswer,
        confirm_answer: confirmSecurityAnswer,
      },
    });
  };

  const handleChoiceSelect = (choice: "password" | "security") => {
    setChoiceDialogOpen(false);
    if (choice === "password") {
      setPasswordDialogOpen(true);
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } else {
      setSecurityAnswerDialogOpen(true);
      setNewSecurityAnswer("");
      setConfirmSecurityAnswer("");
      setShowNewSecurityAnswer(false);
      setShowConfirmSecurityAnswer(false);
    }
  };

  if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="container mx-auto px-4 py-8">
        {successMessage && (
          <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-600 dark:text-green-400">
            {successMessage}
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Manage Users</h1>
          <p className="text-muted-foreground">View and manage all registered users</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "sellers")}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="all" className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                All Users
              </TabsTrigger>
              <TabsTrigger value="sellers" className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Sellers
              </TabsTrigger>
            </TabsList>
            <div className="flex-1 max-w-md ml-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="search"
                  placeholder="Search users..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>All Users ({filteredUsers?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading users...</div>
                ) : filteredUsers && filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No users found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers?.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.id}</TableCell>
                          <TableCell className="font-medium">{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.full_name}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === UserRole.ADMIN ? "default" : "secondary"}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.is_active ? "default" : "secondary"}>
                              {user.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(user.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {user.id === authStore.user?.user_id && user.role === UserRole.ADMIN && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleModifyPassword(user)}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Modify
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(user)}
                                disabled={user.id === authStore.user?.user_id}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sellers">
            <Card>
              <CardHeader>
                <CardTitle>Sellers ({filteredUsers?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading sellers...</div>
                ) : filteredUsers && filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No sellers found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Listings</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(filteredUsers as Seller[])?.map((seller) => (
                        <TableRow key={seller.id}>
                          <TableCell>{seller.id}</TableCell>
                          <TableCell className="font-medium">{seller.username}</TableCell>
                          <TableCell>{seller.email}</TableCell>
                          <TableCell>{seller.full_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{seller.listing_count} listings</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={seller.is_active ? "default" : "secondary"}>
                              {seller.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(seller.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {seller.id === authStore.user?.user_id && seller.role === UserRole.ADMIN && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleModifyPassword(seller)}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Modify
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(seller)}
                                disabled={seller.id === authStore.user?.user_id}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete user "{userToDelete?.username}"? This action cannot be undone and will
                permanently remove the user from the system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Reset password for user: <strong>{userToReset?.username}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPasswordDialogOpen(false);
                  setNewPassword("");
                  setConfirmPassword("");
                  setUserToReset(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handlePasswordReset}
                disabled={passwordResetMutation.isPending}
              >
                {passwordResetMutation.isPending ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Security Question Verification Dialog */}
        <Dialog open={securityVerifyDialogOpen} onOpenChange={setSecurityVerifyDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Verify Security Question</DialogTitle>
              <DialogDescription>
                Please answer the security question to continue modifying your account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="security-question" className="text-sm font-medium">
                  Security Question
                </Label>
                <div className="p-3 bg-muted/50 rounded-md text-sm">
                  Best movie of all time?
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="security-answer">Answer</Label>
                <div className="relative">
                  <Input
                    id="security-answer"
                    type={showSecurityAnswer ? "text" : "password"}
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Enter your answer"
                    className="pr-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSecurityVerify();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowSecurityAnswer(!showSecurityAnswer)}
                  >
                    {showSecurityAnswer ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSecurityVerifyDialogOpen(false);
                  setSecurityAnswer("");
                  setUserToReset(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSecurityVerify}
                disabled={securityVerifyMutation.isPending}
              >
                {securityVerifyMutation.isPending ? "Verifying..." : "Verify"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Choice Dialog - Password or Security Answer */}
        <Dialog open={choiceDialogOpen} onOpenChange={setChoiceDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>What would you like to modify?</DialogTitle>
              <DialogDescription>
                Choose what you want to update for your account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={() => handleChoiceSelect("password")}
              >
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Reset Password</div>
                    <div className="text-sm text-muted-foreground">Change your account password</div>
                  </div>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={() => handleChoiceSelect("security")}
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Update Security Answer</div>
                    <div className="text-sm text-muted-foreground">Change your security question answer</div>
                  </div>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setChoiceDialogOpen(false);
                  setUserToReset(null);
                }}
                className="w-full"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Security Answer Reset Dialog */}
        <Dialog open={securityAnswerDialogOpen} onOpenChange={setSecurityAnswerDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Update Security Answer</DialogTitle>
              <DialogDescription>
                Update security answer for user: <strong>{userToReset?.username}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-security-answer">New Security Answer</Label>
                <div className="relative">
                  <Input
                    id="new-security-answer"
                    type={showNewSecurityAnswer ? "text" : "password"}
                    value={newSecurityAnswer}
                    onChange={(e) => setNewSecurityAnswer(e.target.value)}
                    placeholder="Enter new security answer"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewSecurityAnswer(!showNewSecurityAnswer)}
                  >
                    {showNewSecurityAnswer ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-security-answer">Confirm Security Answer</Label>
                <div className="relative">
                  <Input
                    id="confirm-security-answer"
                    type={showConfirmSecurityAnswer ? "text" : "password"}
                    value={confirmSecurityAnswer}
                    onChange={(e) => setConfirmSecurityAnswer(e.target.value)}
                    placeholder="Confirm new security answer"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmSecurityAnswer(!showConfirmSecurityAnswer)}
                  >
                    {showConfirmSecurityAnswer ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSecurityAnswerDialogOpen(false);
                  setNewSecurityAnswer("");
                  setConfirmSecurityAnswer("");
                  setUserToReset(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSecurityAnswerReset}
                disabled={securityAnswerUpdateMutation.isPending}
              >
                {securityAnswerUpdateMutation.isPending ? "Updating..." : "Update Security Answer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

