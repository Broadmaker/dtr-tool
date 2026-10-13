import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches render/parse crashes so one bad file never whitescreens the app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Local-only: log to console, never upload.
    console.error('[DTR Tool]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 pb-16 pt-10">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-relaxed text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
        >
          <p className="font-semibold">Something went wrong.</p>
          <p className="mt-1">
            Your data never left this browser. Try reloading, or clear the session and re-upload.
          </p>
          <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/5 p-2 font-mono text-xs dark:bg-white/10">
            {String(this.state.error.message || this.state.error)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('dtr-tool:undo:v1');
              } catch {
                /* ignore */
              }
              this.setState({ error: null });
            }}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Dismiss (clears undo snapshot)
          </button>
        </div>
      </div>
    );
  }
}
