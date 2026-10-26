import { LINES } from "./dataset";
import { day, fmtDate, iso } from "./dates";
import { PROJECT, classById } from "./domain";

export type Source = {
  id: string;
  name: string;
  system: string;
  method: string;
  records: number;
  /** Hours before the as-of time that the last successful sync finished. */
  hoursSinceSync: number;
  slaHours: number;
  feeds: string;
  issue?: string;
};

export const SOURCES: Source[] = [
  {
    id: "kaya",
    name: "Kaya procurement & logistics events",
    system: "Kaya platform API",
    method: "REST, incremental by updated_at",
    records: 4_812,
    hoursSinceSync: 0.4,
    slaHours: 2,
    feeds: "PO lines, milestones, shipment tracking",
  },
  {
    id: "p6",
    name: "Integrated master schedule",
    system: "Primavera P6 (XER export)",
    method: "SFTP drop, nightly",
    records: 1_284,
    hoursSinceSync: 7,
    slaHours: 26,
    feeds: "Required-on-site dates, energization milestones",
    issue: "3 activities missing WBS code excluded",
  },
  {
    id: "erp",
    name: "Committed cost & PO register",
    system: "Viewpoint Vista ERP",
    method: "CSV export, nightly",
    records: 214,
    hoursSinceSync: 9,
    slaHours: 26,
    feeds: "PO value, change orders",
    issue: "112 superseded PO revisions collapsed to latest",
  },
  {
    id: "procore",
    name: "Submittal log",
    system: "Procore REST API",
    method: "Webhook + hourly backfill",
    records: 102,
    hoursSinceSync: 1.2,
    slaHours: 4,
    feeds: "Submittal status, revisions, ball in court",
  },
  {
    id: "trackers",
    name: "Supplier expediting trackers",
    system: "Emailed Excel files (9 suppliers)",
    method: "Mailbox parser, on arrival",
    records: 108,
    hoursSinceSync: 216,
    slaHours: 168,
    feeds: "Supplier-committed ship and FAT dates",
    issue: "Prairie Gen Power tracker last received 9 days ago",
  },
];

/** Days since each supplier's expediting tracker last arrived. */
export const TRACKER_AGE_DAYS: Record<string, number> = {
  HALDEN: 3,
  VOLTARIS: 2,
  KEYSTONE: 1,
  PRAIRIE: 9,
  ARDENT: 4,
  BOREALIS: 2,
  CASCADE: 6,
  LINEA: 1,
  STRATUS: 3,
};

export type RawTrackerRow = {
  file: string;
  supplier: string;
  rawTag: string;
  rawShip: string;
  rawQty: string;
  rawStatus: string;
};

const excelSerial = (d: number) => String(d + 25569);
const us = (d: number) => {
  const s = iso(d);
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}/${s.slice(2, 4)}`;
};
const weekOf = (d: number) => {
  const monday = d - ((((d + 4) % 7) + 6) % 7);
  const s = iso(monday);
  return `wk of ${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
};
const dMonY = (d: number) => {
  const [y, m, dd] = iso(d).split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${dd}-${mon}-${y}`;
};
const isoWeek = (d: number) => {
  const thursday = d - ((((d + 4) % 7) + 6) % 7) + 3;
  const year = Number(iso(thursday).slice(0, 4));
  const week = Math.floor((thursday - day(`${year}-01-01`)) / 7) + 1;
  return `W${String(week).padStart(2, "0")} ${year}`;
};

const line = (id: string) => {
  const l = LINES.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown line ${id}`);
  return l;
};

/** A batch as it lands from supplier mailboxes: every file uses its own conventions. */
export const RAW_TRACKER_ROWS: RawTrackerRow[] = [
  {
    file: "Prairie_Halcyon_Expedite_v14.xlsx",
    supplier: "Prairie Gen Power",
    rawTag: "Bldg 1 / Hall 3 Gen sets",
    rawShip: weekOf(line("DC1-H3-GEN").forecastDelivery - 9),
    rawQty: "5",
    rawStatus: "FAT RETEST",
  },
  {
    file: "Prairie_Halcyon_Expedite_v14.xlsx",
    supplier: "Prairie Gen Power",
    rawTag: "DC1-DH4 GENSETS",
    rawShip: us(line("DC1-H4-GEN").forecastDelivery - 9),
    rawQty: "5 ea",
    rawStatus: "In assembly",
  },
  {
    file: "HTW_Order_Status_Meridian.xlsx",
    supplier: "Halden Transformer Works",
    rawTag: "MPT-B2 100MVA MAIN XFMR",
    rawShip: excelSerial(line("DC2-MPT").forecastDelivery - 9),
    rawQty: "2",
    rawStatus: "core stacking",
  },
  {
    file: "HTW_Order_Status_Meridian.xlsx",
    supplier: "Halden Transformer Works",
    rawTag: "USS xfmr B2 H1",
    rawShip: dMonY(line("DC2-H1-USS").forecastDelivery - 9),
    rawQty: "4",
    rawStatus: "Released",
  },
  {
    file: "Ardent - Panhandle - weekly.xlsx",
    supplier: "Ardent Critical Power",
    rawTag: "UPS-1-2 (10 modules)",
    rawShip: isoWeek(line("DC1-H2-UPS").forecastDelivery - 9),
    rawQty: "10",
    rawStatus: "Batt cab delayed",
  },
  {
    file: "Ardent - Panhandle - weekly.xlsx",
    supplier: "Ardent Critical Power",
    rawTag: "UPS-1-3",
    rawShip: "TBD",
    rawQty: "10",
    rawStatus: "Awaiting slot",
  },
  {
    file: "Cascade_CDU_tracker.xlsx",
    supplier: "Cascade Liquid Cooling",
    rawTag: "CDU DC1 Hall1",
    rawShip: us(line("DC1-H1-CDU").forecastDelivery - 9),
    rawQty: "8",
    rawStatus: "HOLD - submittal",
  },
  {
    file: "Cascade_CDU_tracker.xlsx",
    supplier: "Cascade Liquid Cooling",
    rawTag: "CDU Bldg 4 Hall 1",
    rawShip: "3/22/27",
    rawQty: "8",
    rawStatus: "Not started",
  },
  {
    file: "Keystone_Swgr_Status.xlsx",
    supplier: "Keystone Electric Mfg.",
    rawTag: "34.5kV SWGR - DC2",
    rawShip: iso(line("DC2-MVSG").forecastDelivery - 9),
    rawQty: "4",
    rawStatus: "Wiring",
  },
  {
    file: "Keystone_Swgr_Status.xlsx",
    supplier: "Keystone Electric Mfg.",
    rawTag: "SWBD B1-H2",
    rawShip: us(line("DC1-H2-LVSB").forecastDelivery - 9),
    rawQty: "6",
    rawStatus: "Shipped partial",
  },
  {
    file: "Borealis_OrderBook.xlsx",
    supplier: "Borealis Thermal",
    rawTag: "Chiller DC2 H1",
    rawShip: "late Q1 2027",
    rawQty: "5",
    rawStatus: "Scheduled",
  },
  {
    file: "Linea_Busway_Releases.xlsx",
    supplier: "Linea Busway Co.",
    rawTag: "Busway lot DC1 hall 4",
    rawShip: dMonY(line("DC1-H4-BUS").forecastDelivery - 9),
    rawQty: "1 lot",
    rawStatus: "Released",
  },
  {
    file: "Linea_Busway_Releases.xlsx",
    supplier: "Linea Busway Co.",
    rawTag: "Busway lot DC1 hall 4",
    rawShip: dMonY(line("DC1-H4-BUS").forecastDelivery - 9),
    rawQty: "1 lot",
    rawStatus: "Released",
  },
];

export type ParsedDate = { date: number | null; rule: string; confidence: "exact" | "week" | "approximate" | "none" };

/** Resolves a yearless month/day to the next occurrence on or after the as-of date. */
function inferYear(month: number, dayOfMonth: number) {
  const y = Number(iso(PROJECT.asOf).slice(0, 4));
  const candidate = day(`${y}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`);
  return candidate >= PROJECT.asOf - 30
    ? candidate
    : day(`${y + 1}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`);
}

const pad = (n: number | string) => String(n).padStart(2, "0");

export function parseLooseDate(raw: string): ParsedDate {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  if (/^(tbd|tba|n\/?a|-)?$/i.test(s)) return { date: null, rule: "No commitment", confidence: "none" };
  if (/^\d{5}$/.test(s)) return { date: Number(s) - 25569, rule: "Excel serial date", confidence: "exact" };
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return { date: day(s), rule: "ISO 8601", confidence: "exact" };
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { date: day(`${y}-${pad(m[1])}-${pad(m[2])}`), rule: "US m/d/y", confidence: "exact" };
  }
  if ((m = s.match(/^wk of (\d{1,2})\/(\d{1,2})$/i))) {
    return {
      date: inferYear(Number(m[1]), Number(m[2])) + 4,
      rule: "Week-of → Friday, year inferred",
      confidence: "week",
    };
  }
  if ((m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/))) {
    const mon =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase()) +
      1;
    return { date: day(`${m[3]}-${pad(mon)}-${pad(m[1])}`), rule: "dd-Mon-yyyy", confidence: "exact" };
  }
  if ((m = s.match(/^W(\d{1,2}) (\d{4})$/i))) {
    const jan4 = day(`${m[2]}-01-04`);
    const week1Monday = jan4 - ((((jan4 + 4) % 7) + 6) % 7);
    return { date: week1Monday + (Number(m[1]) - 1) * 7 + 4, rule: "ISO week → Friday", confidence: "week" };
  }
  if ((m = s.match(/^(early|mid|late)?\s*Q([1-4]) (\d{4})$/i))) {
    const q = Number(m[2]);
    const start = day(`${m[3]}-${pad((q - 1) * 3 + 1)}-01`);
    const offset = { early: 15, mid: 45, late: 75 }[(m[1] ?? "mid").toLowerCase() as "early" | "mid" | "late"];
    return { date: start + offset, rule: "Quarter phrase → estimate", confidence: "approximate" };
  }
  return { date: null, rule: "Unrecognized format", confidence: "none" };
}

const CLASS_PATTERNS: [RegExp, string][] = [
  [/\b(mpt|main\s*xfmr|100\s*mva)\b/i, "MPT"],
  [/\b(swgr|switchgear|34\.5\s*kv)\b/i, "MVSG"],
  [/\b(uss|unit\s*sub)/i, "USS"],
  [/\b(swbd|switchboard)\b/i, "LVSB"],
  [/\bgen(set|sets|erator)?s?\b/i, "GEN"],
  [/\bups\b/i, "UPS"],
  [/\bchiller/i, "CHLR"],
  [/\bcdu\b/i, "CDU"],
  [/\bbusway\b/i, "BUS"],
  [/\b(fan\s*wall|fwu)\b/i, "FWU"],
];

export type TagMatch = { lineId: string | null; rule: string };

/** Crosswalks a supplier's free-text tag to the canonical PO line. */
export function crosswalkTag(raw: string): TagMatch {
  const cls = CLASS_PATTERNS.find(([re]) => re.test(raw))?.[1];
  if (!cls) return { lineId: null, rule: "No equipment class keyword" };
  const b =
    raw.match(/\b(?:bldg|dc|b)\s*-?\s*(\d)\b/i)?.[1] ??
    raw.match(/\b[A-Z]+-(\d)-\d\b/)?.[1] ??
    raw.match(/-B(\d)\b/i)?.[1];
  const h =
    raw.match(/\b(?:hall|h|dh)\s*-?\s*(\d)\b/i)?.[1] ??
    raw.match(/\b[A-Z]+-\d-(\d)\b/)?.[1] ??
    raw.match(/-DH(\d)\b/i)?.[1];
  if (!b) return { lineId: null, rule: "No building reference" };
  const building = `DC${b}`;
  const id = classById[cls].scope === "building" ? `${building}-${cls}` : h ? `${building}-H${h}-${cls}` : null;
  if (!id) return { lineId: null, rule: "Hall-level equipment without hall" };
  if (!LINES.some((l) => l.id === id)) return { lineId: null, rule: `No PO line for ${id}` };
  return { lineId: id, rule: `${cls} · ${building}${h && classById[cls].scope === "hall" ? ` · Hall ${h}` : ""}` };
}

export type ProcessedRow = RawTrackerRow & {
  parsed: ParsedDate;
  match: TagMatch;
  qty: number | null;
  outcome: "published" | "review" | "quarantined";
  reason: string;
  deltaVsForecast: number | null;
};

export function runTrackerBatch(rows = RAW_TRACKER_ROWS): ProcessedRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const parsed = parseLooseDate(r.rawShip);
    const match = crosswalkTag(r.rawTag);
    const qty = Number.parseInt(r.rawQty, 10);
    const target = match.lineId ? LINES.find((l) => l.id === match.lineId) : undefined;
    const fingerprint = `${r.rawTag}|${r.rawShip}|${r.rawQty}`;
    const delivery = parsed.date === null ? null : parsed.date + 9;
    const base = { ...r, parsed, match, qty: Number.isNaN(qty) ? null : qty, deltaVsForecast: null as number | null };

    if (seen.has(fingerprint)) return { ...base, outcome: "quarantined", reason: "Duplicate row in the same file" };
    seen.add(fingerprint);
    if (!target) return { ...base, outcome: "quarantined", reason: match.rule };
    if (delivery === null)
      return { ...base, outcome: "quarantined", reason: `Ship date "${r.rawShip}" is not a commitment` };
    if (base.qty !== target.qty)
      return {
        ...base,
        outcome: "quarantined",
        reason: `Qty ${base.qty} ≠ PO qty ${target.qty} (partial shipment needs a split line)`,
      };
    const delta = delivery - target.forecastDelivery;
    if (parsed.confidence === "approximate")
      return {
        ...base,
        deltaVsForecast: delta,
        outcome: "review",
        reason: "Approximate date; confirm with supplier before it drives float",
      };
    return {
      ...base,
      deltaVsForecast: delta,
      outcome: "published",
      reason:
        Math.abs(delta) <= 4
          ? `Delivers ${fmtDate(target.forecastDelivery, false)} after transit, matches forecast`
          : `Moves forecast ${delta > 0 ? "+" : ""}${delta}d`,
    };
  });
}

const committed = `$${(LINES.reduce((s, l) => s + l.poValue, 0) / 1e6).toFixed(2)}M`;

export const RECONCILIATION = [
  { check: "PO value: ERP committed cost vs. Kaya PO lines", result: `${committed} = ${committed}`, pass: true },
  { check: "Every PO line has exactly one Procore submittal", result: "102 of 102", pass: true },
  { check: "Every PO line maps to a P6 install activity (ROS date)", result: "102 of 102", pass: true },
  { check: "Superseded ERP revisions collapsed to latest", result: "214 rows → 102 lines", pass: true },
  { check: "Supplier tracker freshness ≤ 7 days", result: "8 of 9 suppliers", pass: false },
];
