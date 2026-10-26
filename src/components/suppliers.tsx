"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, LabelList, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Lock, MailWarning } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { FilterSelect } from "@/components/filter-select";
import { FloatPill, StatusBadge } from "@/components/status-badge";
import { SectionTitle } from "@/components/section-title";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { floatOf, statusOf, supplierScorecard } from "@/lib/analytics";
import { LINES } from "@/lib/dataset";
import { fmtDate } from "@/lib/dates";
import { SUPPLIERS, classById } from "@/lib/domain";
import { money, pct } from "@/lib/format";
import { TRACKER_AGE_DAYS } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const config = { suppliers: { label: "Suppliers", color: "var(--chart-1)" } } satisfies ChartConfig;

function rateColor(r: number) {
  return r >= 0.85 ? "text-ok" : r >= 0.7 ? "text-watch" : "text-crit";
}

export function Suppliers() {
  const rows = useMemo(
    () => supplierScorecard().sort((a, b) => b.critical - a.critical || a.onTimeRate - b.onTimeRate),
    [],
  );
  const [viewAs, setViewAs] = useState("HALDEN");
  const points = rows.map((r) => ({
    name: r.supplier.name.split(" ")[0],
    slip: Number(r.avgSlip.toFixed(1)),
    changes: r.dateChanges,
    value: r.value,
    critical: r.critical,
  }));
  const labelSide = points.map((p) => {
    const twin = points.find((q) => q !== p && q.changes === p.changes && Math.abs(q.slip - p.slip) < 3);
    if (!twin) return "top" as const;
    return p.slip < twin.slip || (p.slip === twin.slip && p.name < twin.name) ? ("left" as const) : ("right" as const);
  });
  const scoped = LINES.filter((l) => l.supplierId === viewAs).sort((a, b) => floatOf(a) - floatOf(b));

  return (
    <>
      <PageHeader
        eyebrow="Supplier performance"
        title="Which suppliers are moving the dates?"
        description="On-time delivery measures where suppliers have landed. Forecast volatility and submittal quality warn you where they're about to slip."
      />

      <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <Card className="pb-0">
          <CardHeader>
            <SectionTitle n="01">Scorecard</SectionTitle>
            <CardDescription>
              Sorted by critical lines, then on-time rate. Used in monthly supplier reviews.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Supplier</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">On-time</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Avg slip</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Date changes</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">1st-pass submittals</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Tracker age</TableHead>
                  <TableHead className="pr-4 text-right">Critical</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const age = TRACKER_AGE_DAYS[r.supplier.id];
                  return (
                    <TableRow key={r.supplier.id}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{r.supplier.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.supplier.category} · {r.lines} lines
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{money(r.value)}</TableCell>
                      <TableCell className={cn("text-right font-mono", rateColor(r.onTimeRate))}>
                        {pct(r.onTimeRate)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs sm:table-cell">
                        {r.avgSlip > 0 ? "+" : ""}
                        {r.avgSlip.toFixed(1)}d
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                        {r.dateChanges}
                      </TableCell>
                      <TableCell
                        className={cn("hidden text-right font-mono text-xs lg:table-cell", rateColor(r.firstPassRate))}
                      >
                        {pct(r.firstPassRate)}
                      </TableCell>
                      <TableCell className="hidden text-right text-xs lg:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            age > 7 ? "text-crit" : "text-muted-foreground",
                          )}
                        >
                          {age > 7 && <MailWarning className="size-3.5" />}
                          {age}d
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {r.critical > 0 ? (
                          <span className="font-mono text-crit">{r.critical}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                        {r.atRisk > 0 && <span className="ml-1 text-xs text-risk">+{r.atRisk}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle n="02">Late and unstable</SectionTitle>
            <CardDescription>
              Average slip vs. how often the forecast changed in 12 weeks. Bubble size is committed value. Upper right
              needs an expediting call.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={config} className="aspect-auto h-80 w-full">
              <ScatterChart margin={{ left: -10, right: 24, top: 16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="slip"
                  name="Avg slip"
                  unit="d"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                />
                <YAxis
                  type="number"
                  dataKey="changes"
                  name="Date changes"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                />
                <ZAxis type="number" dataKey="value" range={[60, 700]} />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                    return active && p ? (
                      <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-muted-foreground">
                          {p.slip}d avg slip · {p.changes} date changes · {money(p.value)}
                        </div>
                      </div>
                    ) : null;
                  }}
                />
                <Scatter
                  isAnimationActive={false}
                  data={points}
                  fill="var(--chart-1)"
                  fillOpacity={0.55}
                  stroke="var(--chart-1)"
                >
                  <LabelList
                    dataKey="name"
                    content={(props) => {
                      const { x, y, width, height, value, index } = props as {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                        value: string;
                        index: number;
                      };
                      const side = labelSide[index];
                      const cx = x + width / 2;
                      const cy = y + height / 2;
                      const pad = width / 2 + 4;
                      return (
                        <text
                          x={side === "left" ? cx - pad : side === "right" ? cx + pad : cx}
                          y={side === "top" ? y - 5 : cy}
                          textAnchor={side === "left" ? "end" : side === "right" ? "start" : "middle"}
                          dominantBaseline={side === "top" ? "auto" : "central"}
                          fontSize={10}
                          fill="var(--muted-foreground)"
                        >
                          {value}
                        </text>
                      );
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-signal" /> Supplier portal preview (row-level security)
          </CardTitle>
          <CardDescription>
            The same report, published once. Each supplier signs in and sees only their own lines through the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Supplier</code> RLS role:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              dim_supplier[supplier_upn] = USERPRINCIPALNAME()
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">View as</span>
            <FilterSelect
              label="View as supplier"
              value={viewAs}
              onChange={setViewAs}
              className="min-w-56"
              options={SUPPLIERS.map((s) => ({ value: s.id, label: `expediting@${s.id.toLowerCase()}.example.com` }))}
            />
            <span className="text-xs text-muted-foreground">
              → {scoped.length} of {LINES.length} lines visible
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {scoped.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div>
                  <div className="font-mono text-xs">{l.tag}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {classById[l.classId].name.split(" (")[0]} · need by {fmtDate(l.ros)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={statusOf(l)} className="hidden sm:inline-flex" />
                  <FloatPill days={floatOf(l)} delivered={l.delivered} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
