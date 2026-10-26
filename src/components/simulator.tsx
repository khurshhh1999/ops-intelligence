"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, Rocket, RotateCcw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EnergizationRunway } from "@/components/energization-runway";
import { FilterSelect } from "@/components/filter-select";
import { LineSheet } from "@/components/line-sheet";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/section-title";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  applyShock,
  projectHalls,
  recoveryOptions,
  type Overrides,
  type RecoveryOption,
  type Shock,
} from "@/lib/analytics";
import { BUILDINGS, CLASSES, DEFAULT_LEASE_RATE, SUPPLIERS, type ProcurementLine } from "@/lib/domain";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "none" | Shock["kind"];

const PRESETS: { label: string; kind: Kind; key: string; weeks: number }[] = [
  { label: "Halden slips another 6 weeks", kind: "supplier", key: "HALDEN", weeks: 6 },
  { label: "Generator FAT failures (+4 wk)", kind: "class", key: "GEN", weeks: 4 },
  { label: "Port congestion hits UPS (+3 wk)", kind: "supplier", key: "ARDENT", weeks: 3 },
];

function keysFor(kind: Kind) {
  if (kind === "supplier") return SUPPLIERS.map((s) => ({ value: s.id, label: s.name }));
  if (kind === "class") return CLASSES.map((c) => ({ value: c.id, label: c.name.split(" (")[0] }));
  if (kind === "building") return BUILDINGS.map((b) => ({ value: b, label: `Everything in ${b}` }));
  return [{ value: "-", label: "—" }];
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" | "good" }) {
  return (
    <div className="flex-1 rounded-lg border bg-background/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums sm:text-2xl",
          tone === "bad" && "text-crit",
          tone === "good" && "text-ok",
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export function Simulator() {
  const [kind, setKind] = useState<Kind>("none");
  const [key, setKey] = useState("-");
  const [weeks, setWeeks] = useState(0);
  const [rate, setRate] = useState(DEFAULT_LEASE_RATE);
  const [applied, setApplied] = useState<string[]>([]);
  const [selected, setSelected] = useState<ProcurementLine | null>(null);

  const shock: Overrides = useMemo(
    () => (kind === "none" ? {} : applyShock({ kind, key, days: weeks * 7 })),
    [kind, key, weeks],
  );
  const options = useMemo(() => recoveryOptions(shock, rate), [shock, rate]);
  const active = useMemo(() => options.filter((o) => applied.includes(o.id)), [options, applied]);

  const today = useMemo(() => projectHalls({}, rate), [rate]);
  const shocked = useMemo(() => projectHalls(shock, rate), [shock, rate]);
  const final = useMemo(() => {
    const recovery: Overrides = Object.assign({}, ...active.map((o) => o.overrides));
    return projectHalls({ ...shock, ...recovery }, rate);
  }, [shock, active, rate]);

  const sum = (h: typeof today) => h.reduce((s, x) => s + x.revenueAtRisk, 0);
  const late = (h: typeof today) => h.filter((x) => x.slipDays > 0).length;
  const cost = active.reduce((s, o) => s + o.cost, 0);

  function setScenario(k: Kind, kk: string, w: number) {
    setKind(k);
    setKey(kk);
    setWeeks(w);
    setApplied([]);
  }

  function toggle(o: RecoveryOption, on: boolean) {
    setApplied((prev) => {
      const conflicts = (x: RecoveryOption) =>
        x.target.id === o.target.id ||
        (o.donor && (x.donor?.id === o.donor.id || x.target.id === o.donor.id)) ||
        (x.donor && x.donor.id === o.target.id);
      const kept = prev.filter((id) => {
        const x = options.find((y) => y.id === id);
        return x ? !conflicts(x) : false;
      });
      return on ? [...kept, o.id] : kept;
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="What-if analysis"
        title="Delay & recovery simulator"
        description="Stress-test a supplier, see which data halls slip and what it costs the owner, then apply the recovery moves a project controls lead would actually make."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setScenario("none", "-", 0);
              setRate(DEFAULT_LEASE_RATE);
            }}
          >
            <RotateCcw data-icon="inline-start" /> Reset
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <SectionTitle n="01">Stress test</SectionTitle>
              <CardDescription>Push every undelivered line in scope by N weeks.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    variant={kind === p.kind && key === p.key && weeks === p.weeks ? "secondary" : "ghost"}
                    className="justify-start"
                    onClick={() => setScenario(p.kind, p.key, p.weeks)}
                  >
                    <ShieldAlert data-icon="inline-start" className="text-risk" />
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <SegmentedControl
                  aria-label="Scope"
                  size="sm"
                  fullWidth
                  value={kind}
                  onChange={(k) => setScenario(k, keysFor(k)[0].value, k === "none" ? 0 : Math.max(weeks, 4))}
                  options={[
                    { value: "none" as Kind, label: "None" },
                    { value: "supplier" as Kind, label: "Supplier" },
                    { value: "class" as Kind, label: "Class" },
                    { value: "building" as Kind, label: "Building" },
                  ]}
                />
                {kind !== "none" && (
                  <FilterSelect
                    label="Target"
                    value={key}
                    className="w-full"
                    onChange={(v) => {
                      setKey(v);
                      setApplied([]);
                    }}
                    options={keysFor(kind)}
                  />
                )}
              </div>
              <div className={cn(kind === "none" && "pointer-events-none opacity-40")}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Additional slip</span>
                  <span className="font-mono">+{weeks} wk</span>
                </div>
                <Slider
                  value={[weeks]}
                  min={0}
                  max={16}
                  step={1}
                  onValueChange={(v) => {
                    setWeeks(Array.isArray(v) ? v[0] : v);
                    setApplied([]);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionTitle n="02">Lease rate assumption</SectionTitle>
              <CardDescription>
                Owner&apos;s wholesale rate. Every day a 12 MW hall slips defers this revenue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">$/kW-month</span>
                <span className="font-mono">${rate}</span>
              </div>
              <Slider
                value={[rate]}
                min={100}
                max={250}
                step={5}
                onValueChange={(v) => setRate(Array.isArray(v) ? v[0] : v)}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                ≈ {money((rate * 1000 * 12 * 12) / 365, 0)} per 12 MW hall per day of delay.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <Stat
              label="Today"
              value={money(sum(today))}
              sub={`${late(today)} halls late`}
              tone={sum(today) > 0 ? "bad" : undefined}
            />
            <ArrowRight className="hidden size-4 self-center text-muted-foreground sm:block" />
            <Stat
              label={kind === "none" || weeks === 0 ? "Scenario (no shock)" : "With scenario"}
              value={money(sum(shocked))}
              sub={`${late(shocked)} halls late`}
              tone={sum(shocked) > 0 ? "bad" : undefined}
            />
            <ArrowRight className="hidden size-4 self-center text-muted-foreground sm:block" />
            <Stat
              label={`After ${active.length} recovery ${active.length === 1 ? "move" : "moves"}`}
              value={money(sum(final))}
              sub={
                active.length
                  ? `${money(sum(shocked) - sum(final))} protected for ${money(cost)}`
                  : "toggle moves below"
              }
              tone={active.length ? "good" : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <SectionTitle n="03">Energization runway under this scenario</SectionTitle>
              <CardDescription>Dashed rings show where each hall sits today.</CardDescription>
            </CardHeader>
            <CardContent>
              <EnergizationRunway halls={final} baseline={today} onSelectLine={setSelected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionTitle n="04">Recovery plan</SectionTitle>
              <CardDescription>
                Ranked by net benefit: revenue protected minus cost. Swaps move interchangeable equipment from a later
                hall that has float to spare.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {options.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nothing is late under this scenario, so no recovery is needed.
                </div>
              )}
              {options.map((o) => {
                const on = applied.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center",
                      on ? "border-ok/40 bg-ok/6" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex flex-1 gap-3">
                      <div
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-md",
                          o.kind === "swap" ? "bg-signal/15 text-signal" : "bg-done/15 text-done",
                        )}
                      >
                        {o.kind === "swap" ? <ArrowLeftRight className="size-4" /> : <Rocket className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{o.title}</div>
                        <div className="text-xs text-muted-foreground">{o.detail}</div>
                        {o.caveat && <div className="mt-1 text-[11px] text-risk">{o.caveat}</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="grid grid-cols-3 gap-4 text-right text-xs">
                        <div>
                          <div className="text-muted-foreground">Recovers</div>
                          <div className="font-mono">{o.daysRecovered}d</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cost</div>
                          <div className="font-mono">{money(o.cost)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Net</div>
                          <div className="font-mono text-ok">{money(o.netBenefit)}</div>
                        </div>
                      </div>
                      <Switch checked={on} onCheckedChange={(v) => toggle(o, v)} aria-label={`Apply ${o.title}`} />
                    </div>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <LineSheet line={selected} onClose={() => setSelected(null)} />
    </>
  );
}
