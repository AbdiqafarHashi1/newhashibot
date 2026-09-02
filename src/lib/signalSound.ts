// Web Audio API synthesized audio alerts for trading signals and market events
// No external mp3 file dependencies required - works reliably in all browsers

class SignalSoundEngine {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.8;

  constructor() {
    // Load preference from localStorage
    const savedSound = localStorage.getItem('hashibot_sound_enabled');
    if (savedSound !== null) {
      this.soundEnabled = savedSound === 'true';
    }
    const savedVol = localStorage.getItem('hashibot_sound_volume');
    if (savedVol !== null) {
      this.volume = parseFloat(savedVol) || 0.8;
    }
  }

  private initContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('hashibot_sound_enabled', String(enabled));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('hashibot_sound_volume', String(this.volume));
  }

  /**
   * Play high-pitch harmonic double chime for BUY / LONG signal
   */
  public playBuySignalChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 0.4, now);
      masterGain.connect(ctx.destination);

      // Tone 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.exponentialRampToValueAtTime(0.6, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Tone 2: 880 Hz (A5) - higher ascending tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.00, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.01, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.7, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.66);

    } catch (err) {
      console.warn('Audio chime playback error:', err);
    }
  }

  /**
   * Play descending double chime for SELL / SHORT signal
   */
  public playSellSignalChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 0.4, now);
      masterGain.connect(ctx.destination);

      // Tone 1: 880 Hz (A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880.00, now);
      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.exponentialRampToValueAtTime(0.6, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.33);

      // Tone 2: 659.25 Hz (E5) - descending tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.01, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.7, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.61);

    } catch (err) {
      console.warn('Audio chime playback error:', err);
    }
  }

  /**
   * Play urgent alert ping for Take Profit or Target Hit
   */
  public playTpHitChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 0.45, now);
      masterGain.connect(ctx.destination);

      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setValueAtTime(0.01, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.6, now + i * 0.08 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.31);
      });
    } catch (err) {
      console.warn('TP Chime error:', err);
    }
  }

  /**
   * Test current sound settings
   */
  public playTestChime() {
    this.playBuySignalChime();
  }
}

export const signalSound = new SignalSoundEngine();
