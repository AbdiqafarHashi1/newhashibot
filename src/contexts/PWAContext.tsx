import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isSafari: boolean;
  isUpdateAvailable: boolean;
  showIOSGuide: boolean;
  setShowIOSGuide: (show: boolean) => void;
  promptInstall: () => Promise<boolean>;
  dismissPrompt: () => void;
  updateApp: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

const DISMISS_STORAGE_KEY = 'hashibot_pwa_install_dismissed_until';

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 1. Detect Standalone Mode (Installed PWA on iOS/Android/Desktop)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const isAndroidApp = document.referrer.includes('android-app://');
      const isApp = isStandaloneMedia || isNavigatorStandalone || isAndroidApp;
      setIsInstalled(isApp);
      return isApp;
    };

    const isStandalone = checkStandalone();

    // 2. Detect iOS Device & Safari Browser
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad OS 13+
    
    // Check if Safari (and not Chrome/CriOS/FxiOS/Instagram in-app browser)
    const isSafariBrowser = /safari/.test(userAgent) && !/chrome|crios|fxios|edgios|opt|instagram|fbav/.test(userAgent);

    setIsIOS(isIOSDevice);
    setIsSafari(isSafariBrowser);

    // If on iOS and not in standalone mode, mark as installable via iOS instructions
    if (isIOSDevice && !isStandalone) {
      const dismissedUntil = localStorage.getItem(DISMISS_STORAGE_KEY);
      const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();
      if (!isDismissed) {
        setIsInstallable(true);
      }
    }

    // 3. Listen for Chromium/Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      const dismissedUntil = localStorage.getItem(DISMISS_STORAGE_KEY);
      const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();
      if (!isDismissed && !isStandalone) {
        setIsInstallable(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Listen for app installed event
    const handleAppInstalled = () => {
      console.log('[PWA] HashiBot was successfully installed.');
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowIOSGuide(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 5. Listen for service worker update events
    const handleUpdateAvailable = () => {
      console.log('[PWA] Update available event received.');
      setIsUpdateAvailable(true);
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    // Check if service worker controller changed
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Service worker controller changed. Refreshing...');
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  // Trigger Android/Desktop install prompt or open iOS guidance modal
  const promptInstall = async (): Promise<boolean> => {
    if (isIOS) {
      setShowIOSGuide(true);
      return true;
    }

    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        return true;
      } else {
        console.log('[PWA] User dismissed install prompt');
        dismissPrompt();
        return false;
      }
    } catch (error) {
      console.error('[PWA] Error calling prompt():', error);
      return false;
    }
  };

  // Snooze prompt for 5 days
  const dismissPrompt = () => {
    setIsInstallable(false);
    setShowIOSGuide(false);
    const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() + fiveDaysInMs));
  };

  // Update app when new SW version is waiting
  const updateApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  return (
    <PWAContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIOS,
        isSafari,
        isUpdateAvailable,
        showIOSGuide,
        setShowIOSGuide,
        promptInstall,
        dismissPrompt,
        updateApp,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

const defaultPWAContext: PWAContextType = {
  isInstallable: false,
  isInstalled: false,
  isIOS: false,
  isSafari: false,
  isUpdateAvailable: false,
  showIOSGuide: false,
  setShowIOSGuide: () => {},
  promptInstall: async () => false,
  dismissPrompt: () => {},
  updateApp: () => {
    window.location.reload();
  },
};

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    return defaultPWAContext;
  }
  return context;
}

