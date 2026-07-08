export class TelegramBrain {
    featureFlags = {
        TELEGRAM_ADMIN_ENABLED: true,
        TELEGRAM_FREE_ENABLED: true,
        TELEGRAM_VIP_ENABLED: true,
        TELEGRAM_ANALYTICS_ENABLED: true,
        TELEGRAM_DEDUPE_ENABLED: true,
        TELEGRAM_COMPACT_LOGS: false,
        RUNTIME_COMPACT_EVENTS: false,
    };
    stats = {
        lastSendAt: null,
        lastFailureAt: null,
        queueSize: 0,
        retryQueueSize: 0,
        disabledChannels: [],
        lastHeartbeat: new Date().toISOString(),
        botStatus: 'healthy',
    };
    sentKeys = new Set();
    messageQueue = [];
    retryQueue = [];
    maxRetries = 3;
    baseBackoffMs = 100;
    // Mock Telegram sending handler for tests/runtime
    onSendMessageMock;
    constructor(flags) {
        if (flags) {
            this.featureFlags = { ...this.featureFlags, ...flags };
        }
    }
    updateFeatureFlags(flags) {
        this.featureFlags = { ...this.featureFlags, ...flags };
    }
    getFeatureFlags() {
        return { ...this.featureFlags };
    }
    getHealth() {
        this.stats.queueSize = this.messageQueue.length;
        this.stats.retryQueueSize = this.retryQueue.length;
        this.stats.lastHeartbeat = new Date().toISOString();
        return { ...this.stats };
    }
    getSentKeys() {
        return Array.from(this.sentKeys);
    }
    clearSentKeys() {
        this.sentKeys.clear();
    }
    /**
     * Routes a message to the appropriate channels based on rules
     */
    async routeMessage(msg) {
        const eventType = msg.eventType.toLowerCase();
        const resolvedChannels = [];
        // Determine channels if not explicitly provided
        if (msg.channels && msg.channels.length > 0) {
            resolvedChannels.push(...msg.channels);
        }
        else {
            // Admin/Ops rules: execution, lifecycle, protection, recovery, provider failures, cleanup failures, scanner failures, runtime alerts
            if (eventType.includes('execution') ||
                eventType.includes('lifecycle') ||
                eventType.includes('protection') ||
                eventType.includes('recovery') ||
                eventType.includes('failure') ||
                eventType.includes('cleanup') ||
                eventType.includes('scanner') ||
                eventType.includes('alert') ||
                eventType.includes('admin') ||
                eventType.includes('delivery_failed')) {
                resolvedChannels.push('admin');
            }
            // VIP rules: full signals, TP updates, breakeven, close, important market notes
            if (eventType === 'signal_created' ||
                eventType === 'signal_approved' ||
                eventType === 'signal_updated' ||
                eventType === 'tp1' ||
                eventType === 'tp2' ||
                eventType === 'breakeven' ||
                eventType === 'closed' ||
                eventType === 'stop' ||
                eventType.includes('vip')) {
                resolvedChannels.push('vip');
            }
            // Free rules: limited previews, delayed signals, educational content, upgrade CTA
            if (eventType === 'signal_created' || // previews of signals
                eventType === 'educational' ||
                eventType === 'upgrade_cta' ||
                eventType.includes('free')) {
                resolvedChannels.push('free');
            }
            // Analytics rules: watchlists, market context, news summaries, non-trading intelligence
            if (eventType.includes('watchlist') ||
                eventType.includes('context') ||
                eventType.includes('news') ||
                eventType.includes('intelligence') ||
                eventType.includes('analytics')) {
                resolvedChannels.push('analytics');
            }
        }
        // Default channel fallback if nothing matched
        if (resolvedChannels.length === 0) {
            resolvedChannels.push('vip');
        }
        const messagesToSend = [];
        for (const channel of resolvedChannels) {
            // Respect feature flags
            if (channel === 'admin' && !this.featureFlags.TELEGRAM_ADMIN_ENABLED)
                continue;
            if (channel === 'free' && !this.featureFlags.TELEGRAM_FREE_ENABLED)
                continue;
            if (channel === 'vip' && !this.featureFlags.TELEGRAM_VIP_ENABLED)
                continue;
            if (channel === 'analytics' && !this.featureFlags.TELEGRAM_ANALYTICS_ENABLED)
                continue;
            // Deduplication checking
            const dedupeKey = `${msg.signalId ?? 'no_sig'}:${channel}:${msg.eventType}:${msg.provider ?? 'neutral'}`;
            if (this.featureFlags.TELEGRAM_DEDUPE_ENABLED && msg.signalId && this.sentKeys.has(dedupeKey)) {
                if (!this.featureFlags.TELEGRAM_COMPACT_LOGS) {
                    console.log(`[TelegramBrain] Suppressed duplicate message: ${dedupeKey}`);
                }
                continue;
            }
            let finalText = msg.text;
            // Package-aware text modification (Free gets limited previews, Delayed info, Upgrade CTA)
            if (channel === 'free' && (msg.eventType === 'SIGNAL_CREATED' || msg.eventType === 'SIGNAL_SENT_FREE')) {
                finalText = `[FREE PREVIEW - DELAYED 15M]\n${msg.text.slice(0, 150)}...\n\n👉 Upgrade to VIP to receive real-time, fully execution-ready signals with automated Bybit/Binance safety protections!`;
            }
            const routedMsg = {
                ...msg,
                id: crypto.randomUUID(),
                text: finalText,
                channels: [channel],
                retryCount: 0,
            };
            messagesToSend.push(routedMsg);
        }
        // Add to queue and trigger processing
        for (const sendMsg of messagesToSend) {
            this.messageQueue.push(sendMsg);
        }
        await this.processQueue();
        return messagesToSend;
    }
    async processQueue() {
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        for (const msg of queue) {
            const channel = msg.channels?.[0] ?? 'vip';
            try {
                let success = true;
                let errorMsg;
                if (this.onSendMessageMock) {
                    const res = await this.onSendMessageMock(channel, msg.text);
                    success = res.success;
                    errorMsg = res.error;
                }
                else {
                    // If in actual production, we would hit telegram API, but this is simulated/mocked for safety
                    console.log(`[TelegramBrain Send] [${channel.toUpperCase()}] ${msg.text}`);
                }
                if (success) {
                    this.stats.lastSendAt = new Date().toISOString();
                    const dedupeKey = `${msg.signalId ?? 'no_sig'}:${channel}:${msg.eventType}:${msg.provider ?? 'neutral'}`;
                    if (msg.signalId) {
                        this.sentKeys.add(dedupeKey);
                    }
                    this.stats.botStatus = 'healthy';
                }
                else {
                    throw new Error(errorMsg ?? 'Failed to send');
                }
            }
            catch (err) {
                const error = err;
                this.stats.lastFailureAt = new Date().toISOString();
                const currentCount = msg.retryCount ?? 0;
                if (currentCount < this.maxRetries) {
                    const retryMsg = {
                        ...msg,
                        retryCount: currentCount + 1,
                        nextAttemptAt: Date.now() + Math.pow(2, currentCount) * this.baseBackoffMs,
                    };
                    this.retryQueue.push(retryMsg);
                    // Operator alert on retried/failed delivery
                    const alertMsg = {
                        eventType: 'DELIVERY_RETRIED',
                        text: `⚠️ [Telegram Retry] Message delivery failed for channel: ${channel}. Retry ${currentCount + 1}/${this.maxRetries} scheduled. Error: ${error.message}`,
                        channels: ['admin'],
                    };
                    this.messageQueue.push(alertMsg);
                }
                else {
                    this.stats.botStatus = 'degraded';
                    // Bounded retries exhausted: critical operator alert
                    const criticalMsg = {
                        eventType: 'DELIVERY_FAILED',
                        text: `🚨 [Telegram CRITICAL Failure] Message delivery failed after ${this.maxRetries} retries on channel: ${channel}. Manual operator review is REQUIRED. Error: ${error.message}`,
                        channels: ['admin'],
                    };
                    this.messageQueue.push(criticalMsg);
                }
            }
        }
        // Process retry queue asynchronously
        if (this.retryQueue.length > 0) {
            const now = Date.now();
            const readyToRetry = this.retryQueue.filter(m => (m.nextAttemptAt ?? 0) <= now);
            this.retryQueue = this.retryQueue.filter(m => (m.nextAttemptAt ?? 0) > now);
            for (const msg of readyToRetry) {
                this.messageQueue.push(msg);
            }
            if (readyToRetry.length > 0) {
                setTimeout(() => {
                    void this.processQueue();
                }, this.baseBackoffMs);
            }
        }
    }
    async forceTriggerRetryNow() {
        const ready = [...this.retryQueue];
        this.retryQueue = [];
        for (const msg of ready) {
            this.messageQueue.push(msg);
        }
        await this.processQueue();
    }
}
export class SaasRouter {
    static getPermissions(customer) {
        const { packageSlug, status } = customer;
        if (!packageSlug || status !== 'active') {
            return {
                hasSignalAccess: false,
                hasExecutionAccess: false,
                hasTelegramAccess: false,
                allowedProviders: [],
                hasFutureMt5Access: false,
            };
        }
        const slug = packageSlug.toLowerCase();
        // Base settings
        let hasSignalAccess = false;
        let hasExecutionAccess = false;
        let hasTelegramAccess = false;
        const allowedProviders = [];
        let hasFutureMt5Access = false;
        // 1. Signal Access & Telegram Access (All packages except free preview have telegram and signal access)
        if (['crypto_signal_room', 'crypto_personal_bot', 'forex_mt5_personal_bot', 'forex_mt5_prop_bot'].includes(slug)) {
            hasSignalAccess = true;
            hasTelegramAccess = true;
        }
        else if (slug === 'free_preview') {
            hasSignalAccess = true; // Free previews can view limited signals on dashboard
            hasTelegramAccess = false; // No telegram notification channel access
        }
        // 2. Automated Execution Access (Only Bot packages)
        if (['crypto_personal_bot', 'forex_mt5_personal_bot', 'forex_mt5_prop_bot'].includes(slug)) {
            hasExecutionAccess = true;
        }
        // 3. Provider Access Rules
        if (slug === 'crypto_personal_bot' || slug === 'crypto_signal_room') {
            allowedProviders.push('binance', 'bybit');
        }
        else if (slug === 'forex_mt5_personal_bot') {
            allowedProviders.push('bybit', 'binance'); // standard support
            allowedProviders.push('mt5_personal');
            hasFutureMt5Access = true;
        }
        else if (slug === 'forex_mt5_prop_bot') {
            allowedProviders.push('bybit', 'binance');
            allowedProviders.push('mt5_personal', 'mt5_prop');
            hasFutureMt5Access = true;
        }
        else if (slug === 'free_preview') {
            allowedProviders.push('binance'); // read-only preview support
        }
        return {
            hasSignalAccess,
            hasExecutionAccess,
            hasTelegramAccess,
            allowedProviders,
            hasFutureMt5Access,
        };
    }
}
