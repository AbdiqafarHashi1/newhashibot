/** Presentation state only: never authentication, a session, JWT or server role. */
export const PREVIEW_FLAG = 'hashibot.owner-preview.v1';
const session = typeof window === 'undefined' ? null : window.sessionStorage;
const read = session?.getItem.bind(session);
const write = session?.setItem.bind(session);
const remove = session?.removeItem.bind(session);
export const isOwnerPreview = () => read?.(PREVIEW_FLAG) === 'active';
export function enterOwnerPreview() {
  write?.(PREVIEW_FLAG, 'active');
  window.location.assign('/admin/mission-control');
}
export function exitOwnerPreview() {
  remove?.(PREVIEW_FLAG);
  window.location.replace('/'); // Drop every in-memory fixture and restore normal transports.
}
export function resetOwnerPreview() { window.location.reload(); }
export const demonstrationLabel = 'DEMONSTRATION EVIDENCE — simulated; not verified performance, payment, membership or certification.';
