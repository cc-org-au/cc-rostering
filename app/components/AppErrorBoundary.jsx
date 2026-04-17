"use client";

import { Component } from "react";

/**
 * Catches render errors so the app does not go to a blank screen without feedback.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "var(--bg-page, #f9fafb)",
            color: "var(--text-primary, #111)",
          }}
        >
          <h1 style={{ fontSize: 20, marginTop: 0 }}>Something went wrong</h1>
          <p style={{ color: "var(--text-muted, #6b7280)", maxWidth: 560 }}>
            The app hit an error while rendering. You can try reloading the page. If it keeps happening, clear the site
            data for localhost or run <code style={{ fontSize: 13 }}>rm -rf .next</code> and restart{" "}
            <code style={{ fontSize: 13 }}>npm run dev</code>.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "var(--bg-muted, #f3f4f6)",
              overflow: "auto",
              fontSize: 13,
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
