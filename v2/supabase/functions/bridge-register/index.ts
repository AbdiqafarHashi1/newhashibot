export const name = 'bridge-register';
export function handler(payload: Record<string, unknown>) { return { ok: true, function: name, acceptedAt: new Date().toISOString(), payload }; }
