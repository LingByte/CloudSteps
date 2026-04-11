import React from "react";
import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "@/stores/authStore";

type AuthGuardProps = {
  children: React.ReactNode;
};

type Role = "user" | "admin" | "student" | "teacher";

export function RequireAuth({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const location = useLocation();

  if (!hasHydrated) return null;

  if (!isAuthenticated || !token) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({
  children,
  roles,
  redirectTo = "/403",
}: AuthGuardProps & {
  roles: Role[];
  redirectTo?: string;
}) {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const userRole = useAuthStore((s) => s.user?.role);
  const location = useLocation();

  if (!hasHydrated) return null;

  const role: Role = (userRole as Role) ?? "user";
  if (!roles.includes(role)) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${redirectTo}?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function PublicOnly({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const location = useLocation();

  if (!hasHydrated) return null;

  if (isAuthenticated && token) {
    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "/";
    return <Navigate to={next} replace />;
  }

  return <>{children}</>;
}
