import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, User, LogOut, Heart, Bell, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { authStore } from "@/store/authStore";
import { logout, getUnreadNotificationCount, getConversations } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import ThemeToggle from "./ThemeToggle";
import sjsuLogo from "../media/sjsu_logo.svg";
import { useEffect, useState } from "react";
import { wsClient } from "@/lib/websocket";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(authStore.isAuthenticated);
  const [isCompactNav, setIsCompactNav] = useState(false);
  const [showForceLogoutDialog, setShowForceLogoutDialog] = useState(false);
  const [forceLogoutMessage, setForceLogoutMessage] = useState("");
  const defaultForceLogoutMessage = "You were logged out because your account was accessed on another device.";

  // Re-check auth state when location changes
  useEffect(() => {
    authStore.initAuth();
    setIsAuthenticated(authStore.isAuthenticated);
  }, [location.pathname]);

  // Get unread notification count
  const { data: unreadCountData } = useQuery({
    queryKey: ["unreadNotificationCount"],
    queryFn: getUnreadNotificationCount,
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Get unread messages count
  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getConversations(),
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadNotificationCount = unreadCountData?.unread_count || 0;
  const unreadMessagesCount = conversations?.reduce((total, conv) => total + conv.unread_count, 0) || 0;
  const showUnreadMessagesBadge = unreadMessagesCount > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateCompactState = () => {
      setIsCompactNav(window.innerWidth < 900);
    };
    updateCompactState();
    window.addEventListener("resize", updateCompactState);
    return () => window.removeEventListener("resize", updateCompactState);
  }, []);

  const showNavLabels = !isCompactNav;

  useEffect(() => {
    const user = authStore.user;
    const token = localStorage.getItem("access_token");

    if (isAuthenticated && user && token) {
      wsClient.connect(user.user_id, token);
    }

    const handleForceLogout = (data?: { reason?: string }) => {
      const reason = data?.reason || defaultForceLogoutMessage;
      setForceLogoutMessage(reason);
      setShowForceLogoutDialog(true);
      authStore.clearAuth();
      wsClient.disconnect();
    };

    wsClient.on("force_logout", handleForceLogout);

    return () => {
      wsClient.off("force_logout", handleForceLogout);
    };
  }, [isAuthenticated]);

  const handleForceLogoutConfirm = () => {
    setShowForceLogoutDialog(false);
    const message = forceLogoutMessage || defaultForceLogoutMessage;
    const encodedMessage = encodeURIComponent(message);
    window.location.href = `/login?message=${encodedMessage}&type=force_logout`;
  };

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "My Items", path: "/my-items", icon: Package },
    { name: "Favorites", path: "/favorites", icon: Heart },
    { name: "Chat", path: "/chat", icon: MessageSquare, badge: showUnreadMessagesBadge ? unreadMessagesCount : undefined },
    { name: "Profile", path: "/profile", icon: User },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    authStore.clearAuth();
    navigate("/login");
  };

  return (
    <>
      <Dialog open={showForceLogoutDialog} onOpenChange={setShowForceLogoutDialog}>
        <DialogContent className="max-w-md border border-destructive/40">
          <DialogHeader>
            <DialogTitle className="text-destructive text-lg">Logged Out</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              {forceLogoutMessage || defaultForceLogoutMessage}
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" className="w-full" onClick={handleForceLogoutConfirm}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navigation */}
      <nav className="bg-background/95 backdrop-blur-md border-b border-border sticky top-0 z-50 transition-all duration-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center space-x-2.5 hover:opacity-80 transition-opacity duration-200">
              <img
                src={sjsuLogo}
                alt="SJSU Logo"
                className="w-8 h-8"
              />
              <span className="font-extrabold text-xl text-primary hidden sm:inline tracking-tight">Spartan Marketplace</span>
            </Link>

            <div className="flex items-center gap-1">
              {isAuthenticated ? (
                <>
                  {navItems.map((item) => (
                    <Link key={item.path} to={item.path}>
                      <Button
                        aria-label={item.name}
                        variant={isActive(item.path) || (item.path === "/chat" && location.pathname.startsWith("/chat")) ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-normal relative transition-all",
                          isActive(item.path) || (item.path === "/chat" && location.pathname.startsWith("/chat"))
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted/50",
                          isCompactNav && "px-3 text-xs"
                        )}
                      >
                        <item.icon className="w-4 h-4" />
                        {showNavLabels && (
                        <span className="hidden sm:inline">{item.name}</span>
                        )}
                        {typeof item.badge === "number" && item.badge > 0 && (
                          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                            {item.badge > 9 ? "9+" : item.badge}
                          </Badge>
                        )}
                      </Button>
                    </Link>
                  ))}
                  {/* Notifications - Icon Only */}
                  <Link to="/notifications">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "relative rounded-full h-9 w-9",
                        isActive("/notifications") && "bg-muted"
                      )}
                    >
                      <Bell className="w-4 h-4" />
                      {unreadNotificationCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                          {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                  <ThemeToggle />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-normal hover:bg-muted/50"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </>
              ) : (
                <>
                  <ThemeToggle />
                  <Link to="/login">
                    <Button variant="ghost" size="sm" className="rounded-full px-4 h-9 text-sm font-normal hover:bg-muted/50">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="sm" className="rounded-full px-4 h-9 text-sm font-normal">
                      Sign Up
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;

