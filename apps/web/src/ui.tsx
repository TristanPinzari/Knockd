import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { setThemePref, useTheme } from "./theme";

export function Logo() {
  return (
    <Link to="/" className="logo">
      knock<span>d</span>
    </Link>
  );
}

/**
 * Flips between light and dark. Shows what a click does: a moon in light mode, a sun in dark mode.
 * Until the first click, the theme follows the computer.
 */
export function ThemeToggle() {
  const { theme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="btn btn-secondary icon-btn"
      onClick={() => setThemePref(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {next === "dark" ? "☾" : "☀"}
    </button>
  );
}

/** Catches a crash in a screen and offers a reload, instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="container">
          <div className="card" style={{ padding: 24, marginTop: 32 }}>
            <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              {this.state.error.message}
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="center">
      <Spinner />
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <span className="avatar">{initials || "?"}</span>;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="row" style={{ marginBottom: 16 }}>
          <h2 className="grow">{title}</h2>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "3 days ago", "2 months ago". */
export function ago(iso: string, now = Date.now()): string {
  const days = Math.round((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
export const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
