import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canUseOfflineBacktestWorkspace } from '../../lib/backtestWorkspaceAccess';
import { labAdminAllowed } from '../../lib/clientBacktestEngine';
/** Verified Admin access, plus the temporary local research workspace while Supabase is paused. */
export function StrictBacktestAdmin({ children }: {
    children: ReactNode;
}) {
    const { user, profile, lastKnownProfile, loading } = useAuth();
    if (canUseOfflineBacktestWorkspace(user?.id))
        return <>{children}</>;
    if (loading)
        return <p className="p-8 text-zinc-300">Verifying Admin access…</p>;
    if (!user)
        return <Navigate to="/login" replace/>;
    if (!labAdminAllowed(user.id, profile ?? lastKnownProfile))
        return <Navigate to="/app/dashboard" replace/>;
    return <>{children}</>;
}
