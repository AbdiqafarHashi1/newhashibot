import { validateCommand, validateEvent, type EventEnvelope } from "../contracts/events.ts";

export type AckDecision = "ack" | "nack" | "dead-letter";
export interface Message { data: string; orderingKey?: string; deliveryAttempt: number; attributes?: Record<string,string>; }
export interface Published { envelope: EventEnvelope; orderingKey?: string; attributes: Record<string,string>; }
export interface Publisher { publish(envelope: EventEnvelope, options?: { orderingKey?: string; deadLetterSource?: string }): Promise<string>; }
export interface Subscription { handle(message: Message): Promise<AckDecision>; }
export interface HandlerResult { outcome: "completed" | "duplicate" | "retry" | "permanent-failure"; }

export const classifyRetry = (error: unknown): "retryable" | "permanent" =>
  /timeout|temporar|rate.?limit|ECONN|unavailable|5\d\d/i.test(error instanceof Error ? error.message : String(error)) ? "retryable" : "permanent";

export function subscriber(handler: (event: EventEnvelope) => Promise<HandlerResult>, options: { command?: boolean; maxAttempts?: number } = {}): Subscription {
  return { async handle(message) {
    try {
      const raw = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
      const event = options.command ? validateCommand(raw) : validateEvent(raw);
      const result = await handler(event);
      if (result.outcome === "retry") return message.deliveryAttempt >= (options.maxAttempts ?? 5) ? "dead-letter" : "nack";
      return "ack";
    } catch (error) {
      if (classifyRetry(error) === "retryable" && message.deliveryAttempt < (options.maxAttempts ?? 5)) return "nack";
      return "dead-letter";
    }
  }};
}

export class InMemoryPubSub implements Publisher {
  readonly published: Published[] = [];
  private handlers: Subscription[] = [];
  subscribe(handler: Subscription) { this.handlers.push(handler); }
  async publish(envelope: EventEnvelope, options: { orderingKey?: string; deadLetterSource?: string } = {}): Promise<string> {
    const valid = validateEvent(envelope); this.published.push({ envelope: valid, orderingKey: options.orderingKey, attributes: { correlation_id: valid.correlation_id, dead_letter_source: options.deadLetterSource || "" } });
    const message = { data: Buffer.from(JSON.stringify(valid)).toString("base64"), orderingKey: options.orderingKey, deliveryAttempt: 1 };
    for (const handler of this.handlers) await handler.handle(message);
    return valid.event_id;
  }
}
