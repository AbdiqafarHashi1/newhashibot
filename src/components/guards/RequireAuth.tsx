import { isOwnerPreview, isAdminPass } from '../../lib/ownerPreview/state';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Spinner = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (isAdminPass() && loc.pathname.startsWith('/admin/')) return children;
  if (isOwnerPreview() && (loc.pathname.startsWith('/app/') || loc.pathname.startsWith('/admin/'))) return children;
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

export function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user, profile, lastKnownProfile, profileError, loading } = useAuth();
  const loc = useLocation();

  if (isAdminPass() && loc.pathname.startsWith('/admin/')) return children;
  if (isOwnerPreview() && (loc.pathname.startsWith('/app/') || loc.pathname.startsWith('/admin/'))) return children;
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;

  // Profile loaded, not admin — redirect
  const effectiveProfile = profile ?? lastKnownProfile;

  if (effectiveProfile && effectiveProfile.role !== 'admin') {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Profile failed to load — show error so it doesn't spin forever
  if (!effectiveProfile && profileError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-red-400 font-medium">Could not load profile</p>
          <p className="text-sm text-zinc-500">{profileError}</p>
          <p className="text-xs text-zinc-600">
            Try refreshing. Go to{' '}
            <a href="/admin/setup" className="text-blue-400 hover:text-blue-300">/admin/setup</a>{' '}
            to diagnose.
          </p>
        </div>
      </div>
    );
  }

  // Profile still loading
  if (!effectiveProfile) return <Spinner />;

  return children;
}
