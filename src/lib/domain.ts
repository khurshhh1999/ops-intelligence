import { day } from "./dates";

export const PROJECT = {
  name: "Project Halcyon",
  campus: "Panhandle AI Campus",
  location: "Amarillo, TX",
  owner: "Meridian Compute",
  gc: "Northline Builders",
  itMw: 144,
  asOf: day("2026-10-23"),
};

/** Wholesale hyperscale lease assumption, $/kW-month. Editable in the simulator. */
export const DEFAULT_LEASE_RATE = 140;

export function revenuePerMwDay(leaseRatePerKwMonth: number) {
  return (leaseRatePerKwMonth * 1000 * 12) / 365;
}

export type BuildingId = "DC1" | "DC2" | "DC3";

export type Hall = {
  id: string;
  building: BuildingId;
  hall: number;
  mw: number;
  plannedEnergization: number;
};

const HALL_PLAN: Record<BuildingId, string[]> = {
  DC1: ["2027-03-01", "2027-04-05", "2027-05-10", "2027-06-14"],
  DC2: ["2027-08-02", "2027-09-06", "2027-10-11", "2027-11-15"],
  DC3: ["2028-01-10", "2028-02-14", "2028-03-20", "2028-04-24"],
};

export const BUILDINGS: BuildingId[] = ["DC1", "DC2", "DC3"];

export const HALLS: Hall[] = BUILDINGS.flatMap((b) =>
  HALL_PLAN[b].map((date, i) => ({
    id: `${b}-H${i + 1}`,
    building: b,
    hall: i + 1,
    mw: 12,
    plannedEnergization: day(date),
  })),
);

/** Utility backfeed to a building must land 30 days before its first data hall energizes. */
export const BACKFEED_LEAD_DAYS = 30;

export function buildingBackfeed(b: BuildingId) {
  const first = HALLS.filter((h) => h.building === b).sort((a, c) => a.plannedEnergization - c.plannedEnergization)[0];
  return first.plannedEnergization - BACKFEED_LEAD_DAYS;
}

export type Supplier = {
  id: string;
  name: string;
  category: string;
  plant: string;
  /** Probability that a line ships within a week of its baseline. */
  reliability: number;
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "HALDEN",
    name: "Halden Transformer Works",
    category: "Transformers",
    plant: "Monterrey, MX",
    reliability: 0.55,
  },
  {
    id: "VOLTARIS",
    name: "Voltaris Power Systems",
    category: "Transformers",
    plant: "Charlotte, NC",
    reliability: 0.82,
  },
  {
    id: "KEYSTONE",
    name: "Keystone Electric Mfg.",
    category: "Switchgear",
    plant: "Pittsburgh, PA",
    reliability: 0.78,
  },
  { id: "PRAIRIE", name: "Prairie Gen Power", category: "Generators", plant: "Mankato, MN", reliability: 0.6 },
  { id: "ARDENT", name: "Ardent Critical Power", category: "UPS", plant: "Raleigh, NC", reliability: 0.74 },
  { id: "BOREALIS", name: "Borealis Thermal", category: "Chillers", plant: "La Crosse, WI", reliability: 0.86 },
  {
    id: "CASCADE",
    name: "Cascade Liquid Cooling",
    category: "Liquid cooling",
    plant: "Hillsboro, OR",
    reliability: 0.7,
  },
  { id: "LINEA", name: "Linea Busway Co.", category: "Busway", plant: "Juárez, MX", reliability: 0.9 },
  { id: "STRATUS", name: "Stratus Air Systems", category: "Air handling", plant: "Tulsa, OK", reliability: 0.88 },
];

export const supplierById = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s])) as Record<string, Supplier>;

export type EquipmentClass = {
  id: string;
  name: string;
  scope: "building" | "hall";
  qty: number;
  unitCost: number;
  leadWeeks: number;
  /** Days between delivery and the energization milestone it feeds (set, terminate, test). */
  installDays: number;
  suppliers: string[];
  specSection: string;
};

export const CLASSES: EquipmentClass[] = [
  {
    id: "MPT",
    name: "Main power transformer (100 MVA)",
    scope: "building",
    qty: 2,
    unitCost: 4_200_000,
    leadWeeks: 128,
    installDays: 150,
    suppliers: ["HALDEN", "VOLTARIS"],
    specSection: "26 12 13",
  },
  {
    id: "MVSG",
    name: "MV switchgear (34.5 kV)",
    scope: "building",
    qty: 4,
    unitCost: 1_150_000,
    leadWeeks: 58,
    installDays: 120,
    suppliers: ["KEYSTONE"],
    specSection: "26 13 00",
  },
  {
    id: "USS",
    name: "Unit substation transformer (3.5 MVA)",
    scope: "hall",
    qty: 4,
    unitCost: 380_000,
    leadWeeks: 72,
    installDays: 95,
    suppliers: ["VOLTARIS", "HALDEN"],
    specSection: "26 11 16",
  },
  {
    id: "LVSB",
    name: "LV switchboard (4000 A)",
    scope: "hall",
    qty: 8,
    unitCost: 210_000,
    leadWeeks: 46,
    installDays: 85,
    suppliers: ["KEYSTONE"],
    specSection: "26 24 13",
  },
  {
    id: "GEN",
    name: "Diesel generator (3.25 MW)",
    scope: "hall",
    qty: 5,
    unitCost: 2_100_000,
    leadWeeks: 82,
    installDays: 80,
    suppliers: ["PRAIRIE"],
    specSection: "26 32 13",
  },
  {
    id: "UPS",
    name: "UPS module (1.25 MW)",
    scope: "hall",
    qty: 10,
    unitCost: 480_000,
    leadWeeks: 42,
    installDays: 60,
    suppliers: ["ARDENT"],
    specSection: "26 33 53",
  },
  {
    id: "CHLR",
    name: "Air-cooled chiller (1,000 ton)",
    scope: "hall",
    qty: 5,
    unitCost: 950_000,
    leadWeeks: 38,
    installDays: 75,
    suppliers: ["BOREALIS"],
    specSection: "23 64 23",
  },
  {
    id: "CDU",
    name: "Coolant distribution unit (1.5 MW)",
    scope: "hall",
    qty: 8,
    unitCost: 260_000,
    leadWeeks: 32,
    installDays: 45,
    suppliers: ["CASCADE"],
    specSection: "23 81 46",
  },
  {
    id: "BUS",
    name: "Overhead busway (hall lot)",
    scope: "hall",
    qty: 1,
    unitCost: 1_400_000,
    leadWeeks: 26,
    installDays: 70,
    suppliers: ["LINEA"],
    specSection: "26 25 00",
  },
  {
    id: "FWU",
    name: "Fan wall unit (250 kW)",
    scope: "hall",
    qty: 12,
    unitCost: 120_000,
    leadWeeks: 28,
    installDays: 60,
    suppliers: ["STRATUS"],
    specSection: "23 73 13",
  },
];

export const classById = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<string, EquipmentClass>;

export const MILESTONES = [
  "PO issued",
  "Submittal sent",
  "Submittal approved",
  "Released for fab",
  "Factory acceptance test",
  "Shipped",
  "Delivered",
] as const;

export type Milestone = { name: (typeof MILESTONES)[number]; date: number; actual: boolean };

export type SubmittalStatus = "Approved" | "Approved as noted" | "In review" | "Revise & resubmit";

export type ProcurementLine = {
  id: string;
  tag: string;
  classId: string;
  supplierId: string;
  building: BuildingId;
  /** Null for building-level equipment that feeds every hall in the building. */
  hallId: string | null;
  qty: number;
  poNumber: string;
  poValue: number;
  /** Required on site: the last delivery date that still holds the energization milestone. */
  ros: number;
  baselineDelivery: number;
  forecastDelivery: number;
  delivered: boolean;
  submittal: {
    number: string;
    status: SubmittalStatus;
    revisions: number;
    submitted: number;
    approved: number | null;
    ballInCourt: string;
  };
  milestones: Milestone[];
  /** Weekly forecast-delivery snapshots, oldest first; last entry is the current week. */
  snapshots: { week: number; forecast: number }[];
  note?: string;
};
