import {
  BUILDINGS,
  CLASSES,
  HALLS,
  PROJECT,
  buildingBackfeed,
  supplierById,
  type BuildingId,
  type EquipmentClass,
  type Milestone,
  type ProcurementLine,
  type SubmittalStatus,
} from "./domain";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SNAPSHOT_WEEKS = 13;

type Story = {
  supplierId?: string;
  /** Current float in days (ROS minus forecast delivery). */
  float: number;
  baselineBuffer?: number;
  /** Week offsets (0 = oldest snapshot) where the supplier pushed the date, with share of the total slip. */
  slipSteps?: [number, number][];
  submittal?: Partial<ProcurementLine["submittal"]>;
  note?: string;
};

/**
 * Hand-placed situations so the demo tells a coherent story; everything else is seeded noise.
 */
const STORY: Record<string, Story> = {
  "DC2-MPT": {
    supplierId: "HALDEN",
    float: -33,
    baselineBuffer: 30,
    slipSteps: [
      [4, 0.35],
      [8, 0.4],
      [11, 0.25],
    ],
    note: "Core steel shortage at Monterrey plant; supplier re-sequenced production twice. Third date push this quarter.",
  },
  "DC3-MPT": {
    supplierId: "VOLTARIS",
    float: 185,
    baselineBuffer: 150,
    slipSteps: [[6, 1]],
    note: "Production slot pulled forward after another customer cancelled. Unit on track for early FAT.",
  },
  "DC1-H3-GEN": {
    float: -23,
    baselineBuffer: 28,
    slipSteps: [
      [5, 0.45],
      [10, 0.55],
    ],
    note: "FAT failed on alternator vibration; retest booked. Supplier tracker not updated in 9 days.",
  },
  "DC1-H4-GEN": {
    float: 40,
    baselineBuffer: 36,
    note: "Units ahead of sequence. Same spec and rating as Hall 3 order.",
  },
  "DC1-H2-UPS": {
    float: -9,
    baselineBuffer: 21,
    slipSteps: [[9, 1]],
    note: "Battery cabinet sub-supplier delay; ocean freight on the critical path.",
  },
  "DC1-H1-CDU": {
    float: 6,
    baselineBuffer: 30,
    slipSteps: [[7, 1]],
    submittal: { status: "Revise & resubmit", revisions: 3, approved: null, ballInCourt: "Cascade Liquid Cooling" },
    note: "Third resubmittal: wetted materials list conflicts with spec 23 81 46. Fabrication cannot release until approved.",
  },
  "DC2-H1-USS": {
    supplierId: "HALDEN",
    float: 4,
    baselineBuffer: 24,
    slipSteps: [
      [9, 0.5],
      [12, 0.5],
    ],
    note: "Same plant as the DC2 main transformer; watch for knock-on slip.",
  },
};

function pickSupplier(cls: EquipmentClass, rand: () => number) {
  return cls.suppliers[Math.floor(rand() * cls.suppliers.length)];
}

function buildLines(): ProcurementLine[] {
  const rand = mulberry32(20261023);
  const asOf = PROJECT.asOf;
  const lines: ProcurementLine[] = [];
  let po = 4500210;
  let sub = 101;

  const scopes: { building: BuildingId; hallId: string | null; cls: EquipmentClass; ros: number }[] = [];
  for (const b of BUILDINGS) {
    for (const cls of CLASSES.filter((c) => c.scope === "building")) {
      scopes.push({ building: b, hallId: null, cls, ros: buildingBackfeed(b) - cls.installDays });
    }
    for (const h of HALLS.filter((x) => x.building === b)) {
      for (const cls of CLASSES.filter((c) => c.scope === "hall")) {
        scopes.push({ building: b, hallId: h.id, cls, ros: h.plannedEnergization - cls.installDays });
      }
    }
  }

  for (const { building, hallId, cls, ros } of scopes) {
    const id = hallId ? `${hallId}-${cls.id}` : `${building}-${cls.id}`;
    const story = STORY[id];
    const supplierId = story?.supplierId ?? pickSupplier(cls, rand);
    const reliability = supplierById[supplierId].reliability;

    const baselineBuffer = story?.baselineBuffer ?? 24 + Math.floor(rand() * 50);
    const baselineDelivery = ros - baselineBuffer;

    let slip: number;
    if (story) {
      slip = baselineBuffer - story.float;
    } else {
      slip = rand() > reliability ? 6 + Math.floor(rand() * 22) : Math.floor(rand() * 12) - 6;
      slip = Math.min(slip, baselineBuffer - 8);
    }
    const forecastDelivery = baselineDelivery + slip;
    const delivered = forecastDelivery <= asOf;

    const poDate = baselineDelivery - cls.leadWeeks * 7 - 10;
    const submitted = poDate + 14 + Math.floor(rand() * 18);
    const cycle = 12 + Math.floor(rand() * 26);
    const revisions = rand() < 0.25 ? 1 + Math.floor(rand() * 2) : 0;
    const approvedDate = submitted + cycle + revisions * 14;

    let status: SubmittalStatus = rand() < 0.3 ? "Approved as noted" : "Approved";
    let approved: number | null = approvedDate;
    let ballInCourt = "Closed";
    if (approvedDate > asOf) {
      status = revisions > 0 ? "Revise & resubmit" : "In review";
      approved = null;
      ballInCourt = revisions > 0 ? "Supplier" : "Engineer of record";
    }
    const submittal = {
      number: `${cls.specSection.replace(/ /g, "")}-${String(sub++).padStart(3, "0")}`,
      status,
      revisions,
      submitted,
      approved,
      ballInCourt,
      ...story?.submittal,
    };

    const releasedForFab = (submittal.approved ?? Math.max(asOf + 10, approvedDate)) + 5;
    const fat = forecastDelivery - 24;
    const shipped = forecastDelivery - 9;
    const milestoneDates: [Milestone["name"], number][] = [
      ["PO issued", poDate],
      ["Submittal sent", submitted],
      ["Submittal approved", submittal.approved ?? Math.max(asOf + 14, approvedDate)],
      ["Released for fab", releasedForFab],
      ["Factory acceptance test", fat],
      ["Shipped", shipped],
      ["Delivered", forecastDelivery],
    ];
    const milestones: Milestone[] = milestoneDates.map(([name, date]) => ({
      name,
      date,
      actual: name === "Submittal approved" ? submittal.approved !== null : date <= asOf,
    }));

    const steps: [number, number][] =
      story?.slipSteps ??
      (Math.abs(slip) <= 5
        ? []
        : rand() < 0.5
          ? [[1 + Math.floor(rand() * 11), 1]]
          : [
              [1 + Math.floor(rand() * 5), 0.5],
              [6 + Math.floor(rand() * 6), 0.5],
            ]);
    const snapshots = Array.from({ length: SNAPSHOT_WEEKS }, (_, w) => {
      const share = steps.filter(([at]) => at <= w).reduce((s, [, p]) => s + p, 0);
      const applied = steps.length ? Math.round(slip * Math.min(1, share)) : slip;
      return { week: asOf - (SNAPSHOT_WEEKS - 1 - w) * 7, forecast: baselineDelivery + applied };
    });
    snapshots[snapshots.length - 1].forecast = forecastDelivery;

    const tagHall = hallId ? `H${hallId.slice(-1)}` : "SITE";
    lines.push({
      id,
      tag: `${building}-${tagHall}-${cls.id}`,
      classId: cls.id,
      supplierId,
      building,
      hallId,
      qty: cls.qty,
      poNumber: String(po++),
      poValue: cls.qty * cls.unitCost * (0.94 + rand() * 0.12),
      ros,
      baselineDelivery,
      forecastDelivery,
      delivered,
      submittal,
      milestones,
      snapshots,
      note: story?.note,
    });
  }
  return lines;
}

export const LINES: ProcurementLine[] = buildLines();
