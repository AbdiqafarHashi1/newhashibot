export type RuntimeStatus = 'healthy' | 'warning' | 'critical';

export interface RuntimeComponentState {
  status: RuntimeStatus;
  lastUpdate: string;
  actionsRequired: string;
}

export interface ProviderState {
  name: string; // binance, bybit, mt5_personal, mt5_prop, coinbase
  status: 'connected' | 'disconnected';
  lastHeartbeat: string;
  apiLatencyMs: number;
  openPositions: number;
  openOrders: number;
  recoveryRequired: boolean;
  protectionOk: boolean;
  lastSync: string;
  runtimeVersion: string;
}

export interface UnifiedRuntimeTruth {
  scanner: RuntimeComponentState;
  execution: RuntimeComponentState;
  protection: RuntimeComponentState;
  recovery: RuntimeComponentState;
  telegram: RuntimeComponentState;
  providers: {
    status: RuntimeStatus;
    lastUpdate: string;
    actionsRequired: string;
    list: Record<string, ProviderState>;
  };
  cleanup: RuntimeComponentState;
  retention: RuntimeComponentState;
}

class RuntimeTruthManager {
  private state: UnifiedRuntimeTruth;

  constructor() {
    const now = new Date().toISOString();
    this.state = {
      scanner: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      execution: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      protection: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      recovery: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      telegram: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      providers: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
        list: {
          binance: {
            name: 'Binance',
            status: 'connected',
            lastHeartbeat: now,
            apiLatencyMs: 42,
            openPositions: 0,
            openOrders: 0,
            recoveryRequired: false,
            protectionOk: true,
            lastSync: now,
            runtimeVersion: '1.4.2',
          },
          bybit: {
            name: 'Bybit',
            status: 'connected',
            lastHeartbeat: now,
            apiLatencyMs: 28,
            openPositions: 0,
            openOrders: 0,
            recoveryRequired: false,
            protectionOk: true,
            lastSync: now,
            runtimeVersion: '1.4.2',
          },
          mt5_personal: {
            name: 'MT5 Personal',
            status: 'disconnected', // placeholder/demo state
            lastHeartbeat: now,
            apiLatencyMs: 0,
            openPositions: 0,
            openOrders: 0,
            recoveryRequired: false,
            protectionOk: true,
            lastSync: now,
            runtimeVersion: '1.0.0-beta',
          },
          mt5_prop: {
            name: 'MT5 Prop',
            status: 'disconnected', // placeholder/demo state
            lastHeartbeat: now,
            apiLatencyMs: 0,
            openPositions: 0,
            openOrders: 0,
            recoveryRequired: false,
            protectionOk: true,
            lastSync: now,
            runtimeVersion: '1.0.0-beta',
          },
          coinbase: {
            name: 'Coinbase',
            status: 'disconnected', // placeholder/demo state
            lastHeartbeat: now,
            apiLatencyMs: 0,
            openPositions: 0,
            openOrders: 0,
            recoveryRequired: false,
            protectionOk: true,
            lastSync: now,
            runtimeVersion: '0.8.1-alpha',
          },
        },
      },
      cleanup: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
      retention: {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      },
    };
  }

  public getTruth(): UnifiedRuntimeTruth {
    return { ...this.state };
  }

  public updateComponent(component: keyof Omit<UnifiedRuntimeTruth, 'providers'>, updates: Partial<RuntimeComponentState>): void {
    this.state[component] = {
      ...this.state[component],
      ...updates,
      lastUpdate: new Date().toISOString(),
    };
  }

  public updateProvider(providerName: string, updates: Partial<ProviderState>): void {
    if (this.state.providers.list[providerName]) {
      const now = new Date().toISOString();
      this.state.providers.list[providerName] = {
        ...this.state.providers.list[providerName],
        ...updates,
        lastHeartbeat: now,
        lastSync: now,
      };
      this.state.providers.lastUpdate = now;

      // Recalculate providers overall status
      const list = Object.values(this.state.providers.list);
      const hasCritical = list.some(p => p.recoveryRequired || (p.status === 'disconnected' && ['binance', 'bybit'].includes(p.name.toLowerCase().replace(' ', ''))));
      const hasWarning = list.some(p => !p.protectionOk);

      if (hasCritical) {
        this.state.providers.status = 'critical';
        this.state.providers.actionsRequired = 'Trigger manual provider recovery session';
      } else if (hasWarning) {
        this.state.providers.status = 'warning';
        this.state.providers.actionsRequired = 'Verify missing order protective links';
      } else {
        this.state.providers.status = 'healthy';
        this.state.providers.actionsRequired = 'None';
      }
    }
  }

  public setAllHealthy(): void {
    const now = new Date().toISOString();
    const keys: Array<keyof Omit<UnifiedRuntimeTruth, 'providers'>> = ['scanner', 'execution', 'protection', 'recovery', 'telegram', 'cleanup', 'retention'];
    for (const key of keys) {
      this.state[key] = {
        status: 'healthy',
        lastUpdate: now,
        actionsRequired: 'None',
      };
    }
    this.state.providers.status = 'healthy';
    this.state.providers.lastUpdate = now;
    this.state.providers.actionsRequired = 'None';
    for (const p of Object.keys(this.state.providers.list)) {
      this.state.providers.list[p].status = ['binance', 'bybit'].includes(p) ? 'connected' : 'disconnected';
      this.state.providers.list[p].recoveryRequired = false;
      this.state.providers.list[p].protectionOk = true;
    }
  }
}

export const runtimeTruth = new RuntimeTruthManager();
export default runtimeTruth;
