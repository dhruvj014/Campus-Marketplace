import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, Users, LogOut, Flag, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, getTheme, setTheme } from "@/lib/utils";
import { authStore } from "@/store/authStore";
import { logout, getReportedItems } from "@/lib/api";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRole } from "@/types";

const AdminNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');

  // Fetch open reports count for badge
  const isAdmin = authStore.isAuthenticated && authStore.user?.role === UserRole.ADMIN;
  const { data: reports } = useQuery({
    queryKey: ["adminReportsCount", isAdmin], // Include isAdmin in query key for proper invalidation
    queryFn: () => getReportedItems(false), // Only get unresolved reports
    refetchInterval: 5000, // Refetch every 5 seconds for instant updates
    enabled: isAdmin,
  });

  // Count open (unresolved and not dismissed) reports
  const openReportsCount = reports?.filter(r => !r.is_resolved && !r.is_dismissed).length || 0;

  useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  const toggleTheme = () => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setCurrentTheme(newTheme);
  };

  const handleLogout = async () => {
    try {
      await logout();
      authStore.clearAuth();
      toast.success("Logged out successfully");
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      // Clear auth anyway
      authStore.clearAuth();
      navigate("/login");
    }
  };

  const navItems = [
    { path: "/admin/dashboard", label: "Home", icon: Home },
    { path: "/admin/listings", label: "Manage Listings", icon: Package },
    { path: "/admin/users", label: "Manage Users", icon: Users },
    { path: "/admin/reports", label: "Reports", icon: Flag },
  ];

  return (
    <nav className="bg-background/80 backdrop-blur-md border-b border-border/60 sticky top-0 z-50 transition-all duration-200">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/admin/dashboard" className="flex items-center space-x-2.5 hover:opacity-80 transition-opacity duration-200">
            <span className="font-semibold text-lg text-foreground">Admin Dashboard</span>
          </Link>
          
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isReportsTab = item.path === "/admin/reports";
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "rounded-lg transition-all duration-200 relative",
                      isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                    {isReportsTab && openReportsCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
                      >
                        {openReportsCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="rounded-lg transition-all duration-200"
              aria-label="Toggle theme"
            >
              {currentTheme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;

