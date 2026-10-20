import { Component } from 'react';

/** A render crash must never leave a blank white screen in a shipped product. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    // Hook point for Sentry/LogRocket etc: window.__SURDHARA_REPORT_ERROR__?.(error, info)
    try { window.__SURDHARA_REPORT_ERROR__?.(error, info); } catch { /* reporting must never throw */ }
    // eslint-disable-next-line no-console
    console.error('SURDHARA render error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal-screen" role="alert">
        <img src="/surdhara-logo.png" alt="" width="72" height="72" />
        <h1>Something went off-beat</h1>
        <p>SURDHARA hit an unexpected problem. Your library and playlists are safe.</p>
        <div className="fatal-actions">
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reload SURDHARA</button>
          <button type="button" className="subtle-button" onClick={() => this.setState({ error: null })}>Try to continue</button>
        </div>
        {import.meta.env.DEV && <pre className="fatal-details">{String(this.state.error?.stack || this.state.error)}</pre>}
      </div>
    );
  }
}
