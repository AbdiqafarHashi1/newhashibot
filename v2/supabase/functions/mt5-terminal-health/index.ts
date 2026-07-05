export const name = 'mt5-terminal-health';
export function handler(payload: Record<string, unknown>) { return { ok: true, function: name, acceptedAt: new Date().toISOString(), payload }; }
