"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EnergizationRunway } from "@/components/energization-runway";
import { LineSheet } from "@/components/line-sheet";
import { FloatPill, StatusBadge } from "@/components/status-badge";
import { SectionTitle } from "@/components/section-title";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ChangeSummary, type MetricChange } from "@/components/ui/change-summary";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SmartRecommendation, type Recommendation } from "@/components/ui/smart-recommendation";
import {
  RISK_ORDER,
  floatOf,
  portfolioKpis,
  recoveryOptions,
  riskTrend,
  statusByClass,
  statusOf,
  type Overrides,
  type RecoveryOption,
} from "@/lib/analytics";
import { LINES } from "@/lib/dataset";
import { fmtDate } from "@/lib/dates";
import { PROJECT, classById, supplierById, type ProcurementLine } from "@/lib/domain";
import { STATUS_STYLE, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const statusConfig = Object.fromEntries(
  RISK_ORDER.map((s) => [s, { label: s, color: STATUS_STYLE[s].hex }]),
) satisfies ChartConfig;

const trendConfig = {
  revenueAtRisk: { label: "Lease revenue at risk", color: "#d23a2f" },
} satisfies ChartConfig;

const USD_COMPACT: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
};

function Kpi({
  label,
  value,
  format,
  suffix,
  sub,
  tone,
}: {
  label: string;
  value: number;
  format?: Intl.NumberFormatOptions;
  suffix?: string;
  sub: React.ReactNode;
  tone?: "bad" | "good";
}) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3.5">
      <span className="sheet-label text-[10px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums",
          tone === "bad" && "text-crit",
          tone === "good" && "text-ok",
        )}
      >
        <NumberTicker value={value} format={format} />
        {suffix && <span className="ml-1 text-base font-medium">{suffix}</span>}
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function toRecommendation(o: RecoveryOption): Recommendation {
  const closes = o.daysRecovered >= -floatOf(o.target);
  const signal: Recommendation["signal"] =
    o.kind === "swap" ? (o.donor?.supplierId === o.target.supplierId ? 3 : 2) : closes ? 2 : 1;
  return {
    id: o.id,
    label: o.kind === "swap" ? "Swap" : "Expediting",
    signal,
    reason: (
      <>
        <strong>{o.title}.</strong> Recovers {o.daysRecovered} days and protects {money(o.revenueProtected)} of lease
        revenue for about {money(o.cost)}. {o.caveat}
      </>
    ),
  };
}

export function Overview() {
  const [building, setBuilding] = useState("ALL");
  const [selected, setSelected] = useState<ProcurementLine | null>(null);
  const [accepted, setAccepted] = useState<Record<string, RecoveryOption>>({});

  const overrides: Overrides = useMemo(
    () => Object.assign({}, ...Object.values(accepted).map((o) => o.overrides)),
    [accepted],
  );

  const lines = useMemo(() => (building === "ALL" ? LINES : LINES.filter((l) => l.building === building)), [building]);
  const k = useMemo(() => portfolioKpis(overrides, 140, lines), [overrides, lines]);
  const halls = k.halls.filter((h) => building === "ALL" || h.building === building);
  const trend = useMemo(() => riskTrend(140, lines).map((t) => ({ ...t, label: fmtDate(t.week, false) })), [lines]);
  const byClass = useMemo(
    () => statusByClass(overrides, lines).filter((r) => RISK_ORDER.some((s) => (r[s] as number) > 0)),
    [overrides, lines],
  );
  const topRisks = useMemo(
    () =>
      lines
        .filter((l) => !l.delivered)
        .sort((a, b) => floatOf(a, overrides) - floatOf(b, overrides))
        .slice(0, 7),
    [lines, overrides],
  );

  const queue = useMemo(() => {
    const all = recoveryOptions();
    const targets = [...new Set(all.map((o) => o.target.id))];
    return targets
      .map((id) => all.filter((o) => o.target.id === id))
      .filter((opts) => building === "ALL" || opts[0].target.building === building);
  }, [building]);

  const changes: MetricChange[] = useMemo(() => {
    const n = LINES[0].snapshots.length;
    return lines
      .map((l) => ({ l, delta: l.snapshots[n - 1].forecast - l.snapshots[n - 3].forecast }))
      .filter((c) => c.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5)
      .map(({ l, delta }) => ({
        label: l.tag,
        change: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}d · ${floatOf(l) < 0 ? `${-floatOf(l)}d late` : `${floatOf(l)}d float`}`,
        tone: delta > 0 ? "bad" : "good",
        direction: delta > 0 ? "down" : "up",
      }));
  }, [lines]);

  const mwTotal = halls.reduce((s, h) => s + h.mw, 0);
  const onTime = lines.filter((l) => l.forecastDelivery - l.baselineDelivery <= 7).length / lines.length;
  const acceptedCount = Object.keys(accepted).length;

  return (
    <>
      <PageHeader
        title="Will every data hall energize on time?"
        description={`Supplier forecasts for ${PROJECT.gc}'s long-lead equipment, checked against the P6 energization plan ${PROJECT.owner} is leasing against.`}
        actions={
          <SegmentedControl
            aria-label="Building"
            value={building}
            onChange={setBuilding}
            size="sm"
            options={[
              { value: "ALL", label: "Campus" },
              { value: "DC1", label: "DC1" },
              { value: "DC2", label: "DC2" },
              { value: "DC3", label: "DC3" },
            ]}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Lease revenue at risk"
          value={k.revenueAtRisk}
          format={USD_COMPACT}
          sub={
            acceptedCount
              ? `after ${acceptedCount} accepted ${acceptedCount === 1 ? "move" : "moves"}`
              : "$140/kW-mo, day-for-day slip"
          }
          tone={k.revenueAtRisk > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Capacity energizing late"
          value={k.mwLate}
          suffix="MW"
          sub={`${k.hallsLate} of ${halls.length} halls · ${mwTotal} MW planned`}
          tone={k.mwLate > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Lines past required date"
          value={k.critical}
          sub={`${k.atRisk} more inside 14 days of float`}
          tone={k.critical > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Committed equipment"
          value={k.poValue}
          format={USD_COMPACT}
          sub={`${k.lineCount} PO lines · ${k.delivered} on site`}
        />
        <Kpi label="Open submittals" value={k.openSubmittals} sub={`median review ${k.medianSubmittalCycle} days`} />
        <Kpi label="Supplier on-time" value={Math.round(onTime * 100)} suffix="%" sub="within 7 days of baseline" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <SectionTitle n="01">Energization runway</SectionTitle>
            <CardDescription>
              A hall energizes once its last required delivery is installed, so negative float moves the date day for
              day. Click a red marker to open the line driving it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnergizationRunway halls={halls} onSelectLine={setSelected} />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="flex items-baseline gap-2.5 text-base font-semibold tracking-tight">
                <span className="font-mono text-[11px] font-normal text-muted-foreground">02</span>
                Recovery queue
              </h2>
              <Link
                href="/simulator"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Model it in S-301 <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {queue.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nothing in {building} is past its required date.
                </p>
              )}
              {queue.map((opts, i) => {
                const t = opts[0].target;
                return (
                  <SmartRecommendation
                    key={t.id}
                    title={`${t.tag} is ${-floatOf(t)} days late`}
                    defaultOpen={i === 0}
                    options={opts.map(toRecommendation)}
                    onAccept={(r) => setAccepted((a) => ({ ...a, [t.id]: opts.find((o) => o.id === r.id)! }))}
                    onUndo={() =>
                      setAccepted((a) => {
                        const next = { ...a };
                        delete next[t.id];
                        return next;
                      })
                    }
                  />
                );
              })}
            </div>
          </section>

          {changes.length > 0 && (
            <ChangeSummary title="Moved in the last two weeks" period="Supplier forecasts" changes={changes} />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle n="03">How fast the risk built up</SectionTitle>
            <CardDescription>Lease revenue at risk, re-scored from each weekly forecast snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="aspect-auto h-52 w-full">
              <AreaChart data={trend} margin={{ left: 0, right: 20, top: 8 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d23a2f" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#d23a2f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="2 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval={2} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  width={44}
                  tickFormatter={(v: number) => money(v, 0)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v, _n, item) => (
                        <div className="flex flex-col">
                          <span className="font-mono">{money(Number(v))}</span>
                          <span className="text-muted-foreground">
                            {item.payload.critical} late · {item.payload.atRisk} at risk
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  isAnimationActive={false}
                  type="stepAfter"
                  dataKey="revenueAtRisk"
                  stroke="#d23a2f"
                  strokeWidth={1.75}
                  fill="url(#riskFill)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle n="04">Float by equipment class</SectionTitle>
            <CardDescription>PO lines by status. Long-lead electrical gear carries the risk.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={statusConfig} className="aspect-auto h-52 w-full">
              <BarChart data={byClass} layout="vertical" margin={{ left: 0, right: 8 }} barCategoryGap={3}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="classId" tickLine={false} axisLine={false} fontSize={10} width={44} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => classById[String(p?.[0]?.payload?.classId)]?.name ?? ""}
                    />
                  }
                />
                {RISK_ORDER.map((s) => (
                  <Bar isAnimationActive={false} key={s} dataKey={s} stackId="a" fill={STATUS_STYLE[s].hex} />
                ))}
              </BarChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {RISK_ORDER.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ background: STATUS_STYLE[s].hex }} />
                  {s}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 pb-0">
        <CardHeader>
          <SectionTitle n="05">Lowest-float equipment</SectionTitle>
          <CardDescription>
            What the owner&apos;s project executive should ask about in Monday&apos;s OAC meeting
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="divide-y border-t">
            {topRisks.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[1fr_100px_64px] xl:grid-cols-[170px_1fr_160px_100px_64px]"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[13px]">{l.tag}</div>
                  <div className="truncate text-xs text-muted-foreground xl:hidden">
                    {classById[l.classId].name.split(" (")[0]} · {supplierById[l.supplierId].name}
                  </div>
                </div>
                <div className="hidden text-sm xl:block">
                  {classById[l.classId].name}
                  <span className="text-muted-foreground"> · {supplierById[l.supplierId].name}</span>
                </div>
                <div className="hidden font-mono text-[11px] leading-relaxed text-muted-foreground xl:block">
                  need {fmtDate(l.ros)}
                  <br />
                  fcst {fmtDate(l.forecastDelivery)}
                </div>
                <div className="hidden sm:block">
                  <StatusBadge status={statusOf(l, overrides)} />
                </div>
                <div className="text-right">
                  <FloatPill days={floatOf(l, overrides)} />
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <LineSheet line={selected} onClose={() => setSelected(null)} />
    </>
  );
}
