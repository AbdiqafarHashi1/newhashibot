export interface AdminIdentityStore {
  userForToken(token: string): Promise<{id: string} | null>;
  roleForUser(id: string): Promise<string | null>;
}
/** Authentication alone never grants fleet, credentials or execution access. */
export async function verifyAdminIdentity(token: string, store: AdminIdentityStore) {
  const user = await store.userForToken(token);
  if (!user) return {ok: false, status: 401, error: 'Unauthorized'} as const;
  if (await store.roleForUser(user.id) !== 'admin') return {ok: false, status: 403, error: 'ADMIN_REQUIRED'} as const;
  return {ok: true, method: 'authenticated_jwt'} as const;
}
