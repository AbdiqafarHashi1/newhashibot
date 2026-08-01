export const EVENT_TYPES = [
  "SignalCreated", "SignalQualified", "TradeOpened", "TradeProtected", "TP1Hit", "TP2Hit",
  "TradeClosed", "RecoveryTriggered", "ScannerCompleted", "Heartbeat", "ProviderDisconnected",
  "ProviderRecovered", "CustomerStarted", "CustomerStopped", "ScanRequested", "ExecutionRequested",
  "ProtectionCheckRequested", "OutcomeEvaluationRequested", "TelegramDeliveryRequested",
  "OperatorActionRequested", "OperatorActionCompleted", "CertificationCompleted",
] as const;

export type EventType = typeof EVENT_TYPES[number];
export type CloudEnvironment = "dev" | "beta" | "prod";
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface EventEnvelope<T extends EventType = EventType, P extends Json = Json> {
  event_id: string;
  event_type: T;
  event_version: 1;
  occurred_at: string;
  producer: string;
  environment: CloudEnvironment;
  correlation_id: string;
  causation_id: string | null;
  customer_id: string | null;
  signal_id: string | null;
  trade_id: string | null;
  runtime_id: string | null;
  execution_scope_key: string | null;
  truth_version: number;
  payload: P;
}

export type CommandType = Extract<EventType,
  "ScanRequested" | "ExecutionRequested" | "ProtectionCheckRequested" |
  "OutcomeEvaluationRequested" | "TelegramDeliveryRequested" | "OperatorActionRequested">;

export interface CommandEnvelope<T extends CommandType = CommandType, P extends Json = Json>
  extends EventEnvelope<T, P> {
  command_id: string;
  idempotency_key: string;
  authorized: boolean;
}

const SECRET_KEYS = /(^|_)(secret|password|token|credential|api_?key|private_?key|authorization|cookie)s?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ContractValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ContractValidationError"; }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractValidationError("envelope must be an object");
  return value as Record<string, unknown>;
}

function assertNoSecrets(value: unknown, path = "payload"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) throw new ContractValidationError(`${path}.${key} is a prohibited secret-bearing field`);
    assertNoSecrets(nested, `${path}.${key}`);
  }
}

export function validateEvent(value: unknown): EventEnvelope {
  const row = object(value);
  if (row.event_version !== 1) throw new ContractValidationError(`unsupported event_version: ${String(row.event_version)}`);
  if (!EVENT_TYPES.includes(row.event_type as EventType)) throw new ContractValidationError(`unsupported event_type: ${String(row.event_type)}`);
  for (const field of ["event_id", "producer", "correlation_id"] as const) {
    if (typeof row[field] !== "string" || !row[field]) throw new ContractValidationError(`${field} is required`);
  }
  if (!UUID.test(String(row.event_id)) || !UUID.test(String(row.correlation_id))) throw new ContractValidationError("event_id and correlation_id must be UUIDs");
  if (row.causation_id !== null && (typeof row.causation_id !== "string" || !UUID.test(row.causation_id))) throw new ContractValidationError("causation_id must be null or a UUID");
  if (!(["dev", "beta", "prod"] as unknown[]).includes(row.environment)) throw new ContractValidationError("environment must be dev, beta, or prod");
  if (typeof row.occurred_at !== "string" || !Number.isFinite(Date.parse(row.occurred_at))) throw new ContractValidationError("occurred_at must be RFC3339-compatible");
  if (!Number.isSafeInteger(row.truth_version) || Number(row.truth_version) < 0) throw new ContractValidationError("truth_version must be a non-negative integer");
  for (const field of ["customer_id", "signal_id", "trade_id", "runtime_id", "execution_scope_key"] as const) {
    if (row[field] !== null && typeof row[field] !== "string") throw new ContractValidationError(`${field} must be string or null`);
  }
  if (!("payload" in row)) throw new ContractValidationError("payload is required");
  assertNoSecrets(row.payload);
  return row as unknown as EventEnvelope;
}

export function validateCommand(value: unknown): CommandEnvelope {
  const event = validateEvent(value);
  const row = value as Record<string, unknown>;
  const commands: readonly string[] = ["ScanRequested", "ExecutionRequested", "ProtectionCheckRequested", "OutcomeEvaluationRequested", "TelegramDeliveryRequested", "OperatorActionRequested"];
  if (!commands.includes(event.event_type)) throw new ContractValidationError(`${event.event_type} is not a command`);
  if (typeof row.command_id !== "string" || !UUID.test(row.command_id)) throw new ContractValidationError("command_id must be a UUID");
  if (typeof row.idempotency_key !== "string" || row.idempotency_key.length < 8) throw new ContractValidationError("idempotency_key is required");
  if (typeof row.authorized !== "boolean") throw new ContractValidationError("authorized must be boolean");
  return row as unknown as CommandEnvelope;
}

export const serializeEnvelope = (event: EventEnvelope): string => JSON.stringify(validateEvent(event));
export const parseEnvelope = (serialized: string): EventEnvelope => validateEvent(JSON.parse(serialized));

export function childEnvelope<T extends EventType>(parent: EventEnvelope, event: Omit<EventEnvelope<T>, "correlation_id" | "causation_id">): EventEnvelope<T> {
  return validateEvent({ ...event, correlation_id: parent.correlation_id, causation_id: parent.event_id }) as EventEnvelope<T>;
}
