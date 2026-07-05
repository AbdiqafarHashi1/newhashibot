export const name = 'bridge-sync';
export function handler(payload: Record<string, unknown>) { return { ok: true, function: name, acceptedAt: new Date().toISOString(), payload }; }
