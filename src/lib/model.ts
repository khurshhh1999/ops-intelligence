import { floatOf, projectHalls, statusOf } from "./analytics";
import { LINES } from "./dataset";
import { day, iso } from "./dates";
import { BUILDINGS, CLASSES, HALLS, SUPPLIERS, buildingBackfeed } from "./domain";

type Row = Record<string, string | number | boolean | null>;

export type TableDef = {
  name: string;
  kind: "fact" | "dimension" | "aggregate";
  grain: string;
  keys: string[];
  rows: () => Row[];
};

const dateKey = (d: number) => Number(iso(d).replace(/-/g, ""));

export const TABLES: TableDef[] = [
  {
    name: "fact_procurement_line",
    kind: "fact",
    grain: "One row per equipment PO line (current state)",
    keys: ["class_key", "supplier_key", "location_key", "forecast_date_key", "ros_date_key"],
    rows: () =>
      LINES.map((l) => ({
        line_key: l.id,
        tag: l.tag,
        po_number: l.poNumber,
        class_key: l.classId,
        supplier_key: l.supplierId,
        location_key: l.hallId ?? `${l.building}-SITE`,
        qty: l.qty,
        po_value: Math.round(l.poValue),
        ros_date_key: dateKey(l.ros),
        baseline_date_key: dateKey(l.baselineDelivery),
        forecast_date_key: dateKey(l.forecastDelivery),
        float_days: floatOf(l),
        slip_days: l.forecastDelivery - l.baselineDelivery,
        risk_status: statusOf(l),
        is_delivered: l.delivered,
        submittal_number: l.submittal.number,
        submittal_status: l.submittal.status,
        submittal_revisions: l.submittal.revisions,
        submittal_sent_date_key: dateKey(l.submittal.submitted),
        submittal_approved_date_key: l.submittal.approved === null ? null : dateKey(l.submittal.approved),
        submittal_cycle_days: l.submittal.approved === null ? null : l.submittal.approved - l.submittal.submitted,
        ball_in_court: l.submittal.ballInCourt,
      })),
  },
  {
    name: "fact_forecast_snapshot",
    kind: "fact",
    grain: "One row per PO line per weekly snapshot (periodic snapshot)",
    keys: ["snapshot_date_key", "class_key", "supplier_key", "location_key"],
    rows: () =>
      LINES.flatMap((l) =>
        l.snapshots.map((s) => ({
          snapshot_date_key: dateKey(s.week),
          line_key: l.id,
          class_key: l.classId,
          supplier_key: l.supplierId,
          location_key: l.hallId ?? `${l.building}-SITE`,
          forecast_date_key: dateKey(s.forecast),
          float_days: l.ros - s.forecast,
        })),
      ),
  },
  {
    name: "fact_milestone",
    kind: "fact",
    grain: "One row per PO line per procurement milestone",
    keys: ["milestone_date_key", "class_key", "supplier_key", "location_key"],
    rows: () =>
      LINES.flatMap((l) =>
        l.milestones.map((m, i) => ({
          line_key: l.id,
          class_key: l.classId,
          supplier_key: l.supplierId,
          location_key: l.hallId ?? `${l.building}-SITE`,
          milestone_seq: i + 1,
          milestone: m.name,
          milestone_date_key: dateKey(m.date),
          is_actual: m.actual,
        })),
      ),
  },
  {
    name: "agg_hall_energization",
    kind: "aggregate",
    grain: "One row per data hall: planned vs projected energization",
    keys: ["location_key"],
    rows: () =>
      projectHalls().map((h) => ({
        location_key: h.id,
        planned_date_key: dateKey(h.plannedEnergization),
        projected_date_key: dateKey(h.projected),
        slip_days: h.slipDays,
        driver_line_key: h.slipDays > 0 ? (h.driver?.id ?? null) : null,
        lease_revenue_at_risk: Math.round(h.revenueAtRisk),
      })),
  },
  {
    name: "dim_location",
    kind: "dimension",
    grain: "One row per building site package and data hall",
    keys: ["location_key"],
    rows: () => [
      ...BUILDINGS.map((b) => ({
        location_key: `${b}-SITE`,
        building: b,
        hall: "Site / utility",
        it_mw: 0,
        planned_energization_date_key: dateKey(buildingBackfeed(b)),
      })),
      ...HALLS.map((h) => ({
        location_key: h.id,
        building: h.building,
        hall: `Hall ${h.hall}`,
        it_mw: h.mw,
        planned_energization_date_key: dateKey(h.plannedEnergization),
      })),
    ],
  },
  {
    name: "dim_equipment_class",
    kind: "dimension",
    grain: "One row per equipment class",
    keys: ["class_key"],
    rows: () =>
      CLASSES.map((c) => ({
        class_key: c.id,
        equipment_class: c.name,
        scope: c.scope,
        spec_section: c.specSection,
        contract_lead_weeks: c.leadWeeks,
        install_days: c.installDays,
      })),
  },
  {
    name: "dim_supplier",
    kind: "dimension",
    grain: "One row per supplier; supplier_upn drives row-level security",
    keys: ["supplier_key"],
    rows: () =>
      SUPPLIERS.map((s) => ({
        supplier_key: s.id,
        supplier: s.name,
        category: s.category,
        plant: s.plant,
        supplier_upn: `expediting@${s.id.toLowerCase()}.example.com`,
      })),
  },
  {
    name: "dim_date",
    kind: "dimension",
    grain: "One row per calendar day, Jan 2024 to Dec 2028",
    keys: ["date_key"],
    rows: () => {
      const out: Row[] = [];
      for (let d = day("2024-01-01"); d <= day("2028-12-31"); d++) {
        const s = iso(d);
        const dow = (d + 4) % 7;
        const monday = d - ((dow + 6) % 7);
        const m = Number(s.slice(5, 7));
        out.push({
          date_key: dateKey(d),
          date: s,
          week_start: iso(monday),
          month: s.slice(0, 7),
          quarter: `${s.slice(0, 4)}-Q${Math.ceil(m / 3)}`,
          year: Number(s.slice(0, 4)),
        });
      }
      return out;
    },
  },
];

export const tableByName = Object.fromEntries(TABLES.map((t) => [t.name, t])) as Record<string, TableDef>;

export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: Row[string]) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
