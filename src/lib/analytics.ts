import { LINES } from "./dataset";
import {
  CLASSES,
  HALLS,
  SUPPLIERS,
  classById,
  revenuePerMwDay,
  supplierById,
  type Hall,
  type ProcurementLine,
} from "./domain";

export type RiskStatus = "Delivered" | "Critical" | "At risk" | "Watch" | "On track";
export const RISK_ORDER: RiskStatus[] = ["Critical", "At risk", "Watch", "On track", "Delivered"];

/** Line id -> forecast delivery day. Used for what-if scenarios and recovery moves. */
export type Overrides = Record<string, number>;

export function forecastOf(l: ProcurementLine, o?: Overrides) {
  return o?.[l.id] ?? l.forecastDelivery;
}

export function floatOf(l: ProcurementLine, o?: Overrides) {
  return l.ros - forecastOf(l, o);
}

export function statusFromFloat(float: number, delivered = false): RiskStatus {
  if (delivered) return "Delivered";
  if (float < 0) return "Critical";
  if (float <= 14) return "At risk";
  if (float <= 30) return "Watch";
  return "On track";
}

export function statusOf(l: ProcurementLine, o?: Overrides): RiskStatus {
  const moved = o?.[l.id] !== undefined;
  return statusFromFloat(floatOf(l, o), l.delivered && !moved);
}

export function linesFeedingHall(hall: Hall, lines = LINES) {
  return lines.filter((l) => l.hallId === hall.id || (l.hallId === null && l.building === hall.building));
}

export type HallProjection = Hall & {
  slipDays: number;
  projected: number;
  driver: ProcurementLine | null;
  driverFloat: number;
  revenueAtRisk: number;
};

/**
 * A hall energizes when its last required delivery has been installed; any negative float on a
 * feeding line pushes the milestone day-for-day.
 */
export function projectHalls(o?: Overrides, leaseRate = 140, lines = LINES): HallProjection[] {
  const perDay = revenuePerMwDay(leaseRate);
  return HALLS.map((h) => {
    let driver: ProcurementLine | null = null;
    let worst = Infinity;
    for (const l of linesFeedingHall(h, lines)) {
      const f = floatOf(l, o);
      if (f < worst) {
        worst = f;
        driver = l;
      }
    }
    const slipDays = Math.max(0, -worst);
    return {
      ...h,
      slipDays,
      projected: h.plannedEnergization + slipDays,
      driver,
      driverFloat: worst,
      revenueAtRisk: slipDays * h.mw * perDay,
    };
  });
}

export function portfolioKpis(o?: Overrides, leaseRate = 140, lines = LINES) {
  const halls = projectHalls(o, leaseRate, lines);
  const statuses = lines.map((l) => statusOf(l, o));
  const cycles = lines
    .filter((l) => l.submittal.approved !== null)
    .map((l) => (l.submittal.approved as number) - l.submittal.submitted)
    .sort((a, b) => a - b);
  return {
    lineCount: lines.length,
    poValue: lines.reduce((s, l) => s + l.poValue, 0),
    delivered: statuses.filter((s) => s === "Delivered").length,
    critical: statuses.filter((s) => s === "Critical").length,
    atRisk: statuses.filter((s) => s === "At risk").length,
    watch: statuses.filter((s) => s === "Watch").length,
    hallsLate: halls.filter((h) => h.slipDays > 0).length,
    mwLate: halls.filter((h) => h.slipDays > 0).reduce((s, h) => s + h.mw, 0),
    revenueAtRisk: halls.reduce((s, h) => s + h.revenueAtRisk, 0),
    medianSubmittalCycle: cycles[Math.floor(cycles.length / 2)] ?? 0,
    openSubmittals: lines.filter((l) => l.submittal.approved === null).length,
    halls,
  };
}

export function statusByClass(o?: Overrides, lines = LINES) {
  return CLASSES.map((c) => {
    const row: Record<string, string | number> = { classId: c.id, name: c.name };
    for (const s of RISK_ORDER) row[s] = 0;
    for (const l of lines.filter((x) => x.classId === c.id)) {
      row[statusOf(l, o)] = (row[statusOf(l, o)] as number) + 1;
    }
    return row;
  });
}

/** Re-evaluates the portfolio as it looked at each weekly snapshot. */
export function riskTrend(leaseRate = 140, lines = LINES) {
  const weeks = lines[0].snapshots.length;
  return Array.from({ length: weeks }, (_, w) => {
    const o: Overrides = {};
    for (const l of lines) o[l.id] = l.snapshots[w].forecast;
    const halls = projectHalls(o, leaseRate, lines);
    const floats = lines.map((l) => l.ros - l.snapshots[w].forecast);
    return {
      week: lines[0].snapshots[w].week,
      critical: floats.filter((f) => f < 0).length,
      atRisk: floats.filter((f) => f >= 0 && f <= 14).length,
      revenueAtRisk: halls.reduce((s, h) => s + h.revenueAtRisk, 0),
    };
  });
}

export function forecastChanges(l: ProcurementLine) {
  let n = 0;
  for (let i = 1; i < l.snapshots.length; i++) if (l.snapshots[i].forecast !== l.snapshots[i - 1].forecast) n++;
  return n;
}

export function slipDays(l: ProcurementLine) {
  return l.forecastDelivery - l.baselineDelivery;
}

export function supplierScorecard(lines = LINES) {
  return SUPPLIERS.map((s) => {
    const own = lines.filter((l) => l.supplierId === s.id);
    const closedSubs = own.filter((l) => l.submittal.approved !== null);
    const firstPass = own.filter((l) => l.submittal.approved !== null && l.submittal.revisions === 0);
    const lastChange = own
      .flatMap((l) => l.snapshots.map((x, i) => (i > 0 && x.forecast !== l.snapshots[i - 1].forecast ? x.week : null)))
      .filter((x): x is number => x !== null)
      .sort((a, b) => b - a)[0];
    return {
      supplier: s,
      lines: own.length,
      value: own.reduce((sum, l) => sum + l.poValue, 0),
      onTimeRate: own.length ? own.filter((l) => slipDays(l) <= 7).length / own.length : 1,
      avgSlip: own.length ? own.reduce((sum, l) => sum + slipDays(l), 0) / own.length : 0,
      critical: own.filter((l) => statusOf(l) === "Critical").length,
      atRisk: own.filter((l) => statusOf(l) === "At risk").length,
      dateChanges: own.reduce((sum, l) => sum + forecastChanges(l), 0),
      firstPassRate: closedSubs.length ? firstPass.length / closedSubs.length : 0,
      avgCycle: closedSubs.length
        ? closedSubs.reduce((sum, l) => sum + ((l.submittal.approved as number) - l.submittal.submitted), 0) /
          closedSubs.length
        : 0,
      lastChange: lastChange ?? null,
    };
  }).filter((r) => r.lines > 0);
}

export type Shock = { kind: "supplier" | "class" | "building"; key: string; days: number };

export function applyShock(shock: Shock, lines = LINES): Overrides {
  const o: Overrides = {};
  if (!shock.days) return o;
  for (const l of lines) {
    if (l.delivered) continue;
    const hit =
      (shock.kind === "supplier" && l.supplierId === shock.key) ||
      (shock.kind === "class" && l.classId === shock.key) ||
      (shock.kind === "building" && l.building === shock.key);
    if (hit) o[l.id] = l.forecastDelivery + shock.days;
  }
  return o;
}

function noun(classId: string) {
  return classById[classId].name.split(" (")[0].replace(/^[A-Z][a-z]/, (m) => m.toLowerCase());
}

const EXPEDITE: Record<string, { days: number; costPct: number; how: string }> = {
  MPT: { days: 10, costPct: 0.05, how: "Fund weekend shifts on winding and tank test" },
  MVSG: { days: 14, costPct: 0.04, how: "Dedicated truck plus expedited factory witness test" },
  USS: { days: 10, costPct: 0.04, how: "Premium production slot plus dedicated freight" },
  LVSB: { days: 12, costPct: 0.03, how: "Ship sections ahead of final QA close-out" },
  GEN: { days: 14, costPct: 0.035, how: "Witness retest at factory; heavy-haul team on standby" },
  UPS: { days: 12, costPct: 0.045, how: "Air-freight battery cabinets instead of ocean" },
  CHLR: { days: 10, costPct: 0.03, how: "Split shipment and expedite control panels" },
  CDU: { days: 10, costPct: 0.04, how: "Air freight plus parallel submittal review" },
  BUS: { days: 7, costPct: 0.02, how: "Ship by run sequence instead of full lot" },
  FWU: { days: 7, costPct: 0.02, how: "Split release to the first two rows" },
};

export type RecoveryOption = {
  id: string;
  kind: "swap" | "expedite";
  target: ProcurementLine;
  donor?: ProcurementLine;
  title: string;
  detail: string;
  daysRecovered: number;
  revenueProtected: number;
  cost: number;
  netBenefit: number;
  caveat?: string;
  overrides: Overrides;
};

/**
 * Searches for the moves a project controls lead would actually make: swap interchangeable
 * equipment from a later hall into the late one, or pay to expedite.
 */
export function recoveryOptions(base: Overrides = {}, leaseRate = 140, lines = LINES): RecoveryOption[] {
  const baseRevenue = projectHalls(base, leaseRate, lines).reduce((s, h) => s + h.revenueAtRisk, 0);
  const evaluate = (o: Overrides) =>
    baseRevenue - projectHalls({ ...base, ...o }, leaseRate, lines).reduce((s, h) => s + h.revenueAtRisk, 0);

  const options: RecoveryOption[] = [];
  const late = lines.filter((l) => floatOf(l, base) < 0 && !(l.delivered && base[l.id] === undefined));

  for (const target of late) {
    const tf = forecastOf(target, base);
    let best: RecoveryOption | null = null;
    for (const donor of lines) {
      if (donor.id === target.id || donor.classId !== target.classId) continue;
      if (donor.ros <= target.ros) continue;
      const df = forecastOf(donor, base);
      if (df >= tf) continue;
      const o: Overrides = { [target.id]: df, [donor.id]: tf };
      const saved = evaluate(o);
      if (saved <= 0) continue;
      const donorFloat = donor.ros - tf;
      const sameSupplier = donor.supplierId === target.supplierId;
      const option: RecoveryOption = {
        id: `swap-${target.id}-${donor.id}`,
        kind: "swap",
        target,
        donor,
        title: `Re-sequence ${noun(target.classId)} from ${donor.hallId ?? donor.building} into ${target.hallId ?? target.building}`,
        detail: `${donor.tag} is forecast ${-(df - tf)} days earlier than ${target.tag}. Swapping allocations leaves ${donor.hallId ?? donor.building} with ${donorFloat} days of float.`,
        daysRecovered: Math.min(tf - df, -floatOf(target, base)),
        revenueProtected: saved,
        cost: sameSupplier ? 25_000 : 60_000,
        netBenefit: saved - (sameSupplier ? 25_000 : 60_000),
        caveat: sameSupplier
          ? donor.delivered
            ? "Unit already on site; confirm laydown transfer and warranty start date."
            : "Same supplier and spec. Needs a PO allocation change only."
          : `Different manufacturer (${supplierById[donor.supplierId].name}). Engineer of record must confirm interchangeability.`,
        overrides: o,
      };
      if (!best || option.netBenefit > best.netBenefit) best = option;
    }
    if (best) options.push(best);

    const ex = EXPEDITE[target.classId];
    const days = Math.min(ex.days, -floatOf(target, base));
    const o: Overrides = { [target.id]: tf - ex.days };
    const saved = evaluate(o);
    const cost = target.poValue * ex.costPct;
    options.push({
      id: `expedite-${target.id}`,
      kind: "expedite",
      target,
      title: `Expedite ${target.tag}`,
      detail: `${ex.how}. Pulls delivery in by about ${ex.days} days.`,
      daysRecovered: days,
      revenueProtected: saved,
      cost,
      netBenefit: saved - cost,
      caveat:
        days < -floatOf(target, base) ? `Closes ${days} of ${-floatOf(target, base)} days; still late.` : undefined,
      overrides: o,
    });
  }
  return options.sort((a, b) => b.netBenefit - a.netBenefit);
}
