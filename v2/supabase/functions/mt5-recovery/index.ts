export const name = 'mt5-recovery';
export function handler(payload: Record<string, unknown>) { return { ok: true, function: name, acceptedAt: new Date().toISOString(), payload }; }
