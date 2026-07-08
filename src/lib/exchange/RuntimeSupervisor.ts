export type HealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Recovering' | 'Disabled';

export interface ComponentHealth {
  component: string;
  status: HealthStatus;
  lastCheckedAt: string;
  details: string;
}

export interface RuntimeHealthReport {
  timestamp: string;
  overallStatus: HealthStatus;
  components: Record<string, ComponentHealth>;
}

export class RuntimeSupervisor {
  private componentStates: Record<string, ComponentHealth> = {};

  constructor() {
    const components = [
      'Scanner',
      'Arbitrator',
      'Execution',
      'Protection',
      'Recovery',
      'Telegram',
      'Retention',
      'Binance',
      'Bybit',
      'Customer Access',
      'Provider Health'
    ];
    for (const comp of components) {
      this.componentStates[comp] = {
        component: comp,
        status: 'Healthy',
        lastCheckedAt: new Date().toISOString(),
        details: 'Initialized successfully.'
      };
    }
  }

  reportHealth(component: string, status: HealthStatus, details: string): void {
    if (this.componentStates[component]) {
      this.componentStates[component] = {
        component,
        status,
        lastCheckedAt: new Date().toISOString(),
        details
      };
    }
  }

  getHealthReport(): RuntimeHealthReport {
    const componentsList = Object.values(this.componentStates);
    let overallStatus: HealthStatus = 'Healthy';

    if (componentsList.some(c => c.status === 'Critical')) {
      overallStatus = 'Critical';
    } else if (componentsList.some(c => c.status === 'Warning' || c.status === 'Recovering')) {
      overallStatus = 'Warning';
    } else if (componentsList.every(c => c.status === 'Disabled')) {
      overallStatus = 'Disabled';
    }

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      components: { ...this.componentStates }
    };
  }
}
