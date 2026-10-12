import { useSyncExternalStore } from 'react';
import { useAuth } from './AuthContext';
import { isOwnerPreview, exitOwnerPreview } from '../lib/ownerPreview/state';
import { previewStore } from '../lib/ownerPreview/adapter';

/** Page presentation only. Guards and authorization must continue to use useAuth. */
export function usePreviewViewer() {
  const auth = useAuth();
  useSyncExternalStore(previewStore.subscribe, previewStore.snapshot);
  if (!isOwnerPreview()) return { ...auth, subject: auth.user, displayProfile: auth.profile };
  const customer = previewStore.customer();
  return {
    ...auth,
    // These are fixture projections for existing customer UI, never Supabase User/Session.
    subject: customer,
    displayProfile: customer,
    session: null,
    isAdmin: false,
    loading: false,
    signOut: async () => exitOwnerPreview(),
  };
}
