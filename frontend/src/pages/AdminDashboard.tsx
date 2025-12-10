import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminNavbar from "@/components/AdminNavbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminStats } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { Users, Package, TrendingUp, ShoppingCart, BarChart3, PieChart } from "lucide-react";
import { BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCategory } from "@/lib/utils";

const COLORS = ['var(--chart-primary)', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#f59e0b'];

export default function AdminDashboard() {
  const navigate = useNavigate();

  // Check if user is admin
  useEffect(() => {
    if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["adminStats"],
    queryFn: getAdminStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (!authStore.isAuthenticated || authStore.user?.role !== UserRole.ADMIN) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-destructive">Error loading dashboard data</div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const categoryData = stats
    ? Object.entries(stats.category_breakdown).map(([category, count]) => ({
      name: formatCategory(category),
      value: count,
    }))
    : [];

  const statusData = stats
    ? Object.entries(stats.status_breakdown).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
    }))
    : [];

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of marketplace statistics and activity</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.users.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.users.active || 0} active users
              </p>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.listings.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.listings.active || 0} active listings
              </p>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sellers</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.users.sellers || 0}</div>
              <p className="text-xs text-muted-foreground">
                Users with listings
              </p>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.users.recent_registrations || 0}</div>
              <p className="text-xs text-muted-foreground">
                New users (30 days)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Listing Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Available</span>
                  <span className="font-semibold">{stats?.listings.active || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Sold</span>
                  <span className="font-semibold">{stats?.listings.sold || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reserved</span>
                  <span className="font-semibold">{stats?.listings.reserved || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Recent (30 days)</span>
                  <span className="font-semibold">{stats?.listings.recent || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Listings by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-8">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Listings by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--chart-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-8">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

