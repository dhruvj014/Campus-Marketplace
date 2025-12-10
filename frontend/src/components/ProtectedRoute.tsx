import { Navigate, useLocation } from "react-router-dom";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { useEffect, useState } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireRole?: UserRole;
  excludeRole?: UserRole;
  redirectTo?: string;
}

function checkAuthorization(
  requireAuth: boolean,
  requireRole?: UserRole,
  excludeRole?: UserRole
): boolean {
  authStore.initAuth();
  
  let authorized = true;

  if (requireAuth && !authStore.isAuthenticated) {
    authorized = false;
  }

  if (requireRole && authStore.user?.role !== requireRole) {
    authorized = false;
  }

  if (excludeRole && authStore.user?.role === excludeRole) {
    authorized = false;
  }

  return authorized;
}

export default function ProtectedRoute({
  children,
  requireAuth = true,
  requireRole,
  excludeRole,
  redirectTo = "/login",
}: ProtectedRouteProps) {
  const location = useLocation();
  // Check auth immediately on mount
  const [isAuthorized, setIsAuthorized] = useState(() => 
    checkAuthorization(requireAuth, requireRole, excludeRole)
  );

  useEffect(() => {
    // Re-check auth state whenever location changes
    const authorized = checkAuthorization(requireAuth, requireRole, excludeRole);
    setIsAuthorized(authorized);
  }, [location.pathname, requireAuth, requireRole, excludeRole]);

  if (!isAuthorized) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

