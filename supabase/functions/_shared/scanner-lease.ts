/** One pipeline per project, including manual requests and duplicate cron callers. */
export async function withScannerLease<T>(db: any, work: () => Promise<T>): Promise<T | { skipped: true; reason: string }> {
  const token = crypto.randomUUID();
  const acquired = await db.rpc('claim_scanner_resource_lease', { p_token: token });
  if (acquired.error) throw new Error('SCANNER_RESOURCE_LEASE_UNAVAILABLE');
  if (acquired.data !== true) return { skipped: true, reason: 'scanner_already_running' };
  try {
    return await work();
  } finally {
    // A failed release expires automatically. Never release another invocation's lease.
    const released = await db.rpc('release_scanner_resource_lease', { p_token: token });
    if (released.error) console.error('SCANNER_RESOURCE_LEASE_RELEASE_FAILED');
  }
}
