import type { Command } from '../command-queue/index.js';
import type { ExecutionAdapter, AdapterHealth } from './index.js';
import type { EntryRequest, ExchangeProvider, ProtectionRequest, ReconcileRequest, ReplaceStopRequest } from '../exchange-provider.js';

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}
function text(value: unknown, fallback = ''): string { return typeof value === 'string' && value ? value : fallback; }
function num(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function optionalNum(value: unknown): number | undefined { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function side(value: unknown): 'long'|'short' { return String(value).toLowerCase() === 'short' ? 'short' : 'long'; }

export class ExchangeProviderExecutionAdapter implements ExecutionAdapter {
  private connected = false;
  constructor(private readonly provider: ExchangeProvider) {}
  async connect(): Promise<void> { await this.provider.fetchAccount(); this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }
  async health(): Promise<AdapterHealth> {
    try { await this.provider.fetchAccount(); return { status: this.connected ? 'healthy' : 'degraded', message: this.connected ? undefined : 'adapter not connected', checkedAt: new Date().toISOString() }; }
    catch (error) { return { status: 'down', message: error instanceof Error ? error.message : 'provider health failed', checkedAt: new Date().toISOString() }; }
  }
  async heartbeat(): Promise<AdapterHealth> { return this.health(); }
  async openPosition(command: Command) { return this.provider.placeEntryOrder(this.entry(command)); }
  async modifyPosition(command: Command) { return this.provider.reconcilePosition(this.reconcile(command)); }
  async closePosition(command: Command) { const p = asRecord(command.payload); return this.provider.closePosition({ ...this.reconcile(command), quantity: optionalNum(p.quantity), reason: text(p.reason, command.action) }); }
  async partialClose(command: Command) { return this.closePosition(command); }
  async moveStopLoss(command: Command) { const p = asRecord(command.payload); return this.provider.replaceSL({ ...this.protection(command), stopLoss: num(p.stopLoss ?? p.stop_loss), reason: text(p.reason, 'manual') } satisfies ReplaceStopRequest); }
  async moveTakeProfit(command: Command) { return this.provider.repairProtection(this.protection(command)); }
  async startTrailing(command: Command) { return this.provider.executeProfitLock({ ...this.reconcile(command), entryPrice: num(asRecord(command.payload).entryPrice), stopLoss: num(asRecord(command.payload).stopLoss), currentPrice: num(asRecord(command.payload).currentPrice), highestPositiveR: num(asRecord(command.payload).highestPositiveR), quantity: num(asRecord(command.payload).quantity), side: side(asRecord(command.payload).side) }); }
  async cancelOrder(command: Command) { return this.provider.cancelOrder(this.reconcile(command)); }
  async getPosition(positionId: string) { return (await this.provider.fetchOpenPositions()).find(p => p.providerPositionId === positionId) ?? null; }
  async getOrders(accountId: string) { void accountId; return this.provider.fetchOpenOrders(); }
  async getBalance(accountId: string) { void accountId; return this.provider.getBalances(); }
  async getSymbolInfo(symbol: string) { return { provider: this.provider.metadata.id, symbol, supportsNativeProtection: this.provider.metadata.supportsNativeProtection }; }
  async reconnect(): Promise<void> { await this.disconnect(); await this.connect(); }
  async synchronize(accountId: string) { void accountId; return this.provider.fetchAccount(); }
  async repair(command: Command) { return this.provider.repairProtection(this.protection(command)); }
  private entry(command: Command): EntryRequest { const p = asRecord(command.payload); return { signalId: command.signalId, symbol: text(p.symbol), side: side(p.side), quantity: num(p.quantity), entryPrice: optionalNum(p.entryPrice ?? p.entry_price), stopLoss: num(p.stopLoss ?? p.stop_loss), tp1: num(p.tp1 ?? (Array.isArray(p.takeProfits) ? p.takeProfits[0] : undefined)), tp2: num(p.tp2 ?? (Array.isArray(p.takeProfits) ? p.takeProfits[1] : undefined)), leverage: optionalNum(p.leverage), metadata: { commandId: command.id, customerId: command.customerId, ...asRecord(p.metadata) } }; }
  private protection(command: Command): ProtectionRequest { const e = this.entry(command); return { symbol: e.symbol, side: e.side, quantity: e.quantity, entryPrice: e.entryPrice, stopLoss: e.stopLoss, tp1: e.tp1, tp2: e.tp2, metadata: e.metadata }; }
  private reconcile(command: Command): ReconcileRequest { const p = asRecord(command.payload); return { executionId: text(command.tradeId ?? p.executionId), symbol: text(p.symbol), providerOrderId: text(p.providerOrderId), providerPositionId: text(p.providerPositionId), metadata: { commandId: command.id, ...asRecord(p.metadata) } }; }
}
