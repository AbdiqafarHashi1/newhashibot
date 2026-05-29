import { Component, ErrorInfo, ReactNode } from 'react';
import { LOGIN_DEBUG_BUILD_MARKER } from '../lib/supabaseEnv';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

interface GlobalErrorBoundaryState {
  error: Error | null;
}

export default class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HashiBot Global Error Boundary]', {
      marker: LOGIN_DEBUG_BUILD_MARKER,
      message: error.message,
      componentStack: info.componentStack,
      currentUrl: typeof window === 'undefined' ? 'server-render-or-build' : window.location.href,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const currentUrl = typeof window === 'undefined'
      ? 'server-render-or-build'
      : window.location.href;

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl bg-zinc-900 border border-red-500/40 rounded-2xl p-6 shadow-xl">
          <p className="font-mono text-xs text-blue-300 mb-4">
            LOGIN_DEBUG_BUILD_MARKER: {LOGIN_DEBUG_BUILD_MARKER}
          </p>
          <h1 className="text-xl font-bold text-red-300 mb-2">HashiBot could not render this screen</h1>
          <p className="text-sm text-zinc-400 mb-5">
            A runtime error was caught so the app can show this safe panel instead of a blank page.
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-zinc-500 mb-1">error message</div>
              <div className="font-mono text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg p-3 break-all">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 mb-1">current URL</div>
              <div className="font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded-lg p-3 break-all">
                {currentUrl}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
