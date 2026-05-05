import React from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    window.keel?.logRendererError?.({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const wrap: React.CSSProperties = {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', padding: 32, textAlign: 'center', fontFamily: 'inherit',
      color: 'var(--text-primary)', background: 'var(--surface-base)',
    };
    const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 8, maxWidth: 520 };
    const btn: React.CSSProperties = {
      marginTop: 20, padding: '10px 18px', borderRadius: 10, border: 'none',
      background: 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    };

    return (
      <div style={wrap}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong.</div>
        <div style={muted}>
          Keel hit an unexpected error and the window needs to be reloaded. If this keeps happening, open
          Settings → Help &amp; Feedback → Copy diagnostic info, and paste it into a GitHub issue.
        </div>
        <div style={{ ...muted, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>
          {this.state.error.message}
        </div>
        <button type="button" style={btn} onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
