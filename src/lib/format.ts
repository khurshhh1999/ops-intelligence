import type { RiskStatus } from "./analytics";

export function money(n: number, digits = 1) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function signedDays(n: number) {
  return `${n > 0 ? "+" : ""}${n}d`;
}

export const STATUS_STYLE: Record<RiskStatus, { dot: string; text: string; bg: string; hex: string }> = {
  Critical: { dot: "bg-crit", text: "text-crit", bg: "bg-crit/8 border-crit/25", hex: "#d23a2f" },
  "At risk": { dot: "bg-risk", text: "text-risk", bg: "bg-risk/8 border-risk/25", hex: "#e8590c" },
  Watch: { dot: "bg-watch", text: "text-watch", bg: "bg-watch/8 border-watch/25", hex: "#d9a514" },
  "On track": { dot: "bg-ok", text: "text-ok", bg: "bg-ok/8 border-ok/25", hex: "#2f7d4f" },
  Delivered: { dot: "bg-done", text: "text-done", bg: "bg-done/8 border-done/25", hex: "#9db5f5" },
};
