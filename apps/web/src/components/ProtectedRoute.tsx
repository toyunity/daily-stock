import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Front-end access gate. This is UX-level defense only — the real enforcement
 * is Postgres RLS (`is_approved()`), so an unapproved user who bypasses this
 * still cannot read any report row.
 */
export function ProtectedRoute({
  children,
  requireApproved = true,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireApproved?: boolean;
  requireAdmin?: boolean;
}) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        불러오는 중…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (requireAdmin && profile?.role !== "admin") return <Navigate to="/" replace />;
  if (requireApproved && !profile?.is_approved) return <Navigate to="/pending" replace />;

  return <>{children}</>;
}
