"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Circle, FileWarning } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { FloatPill, StatusBadge } from "@/components/status-badge";
import { floatOf, forecastChanges, recoveryOptions, statusOf } from "@/lib/analytics";
import { fmtDate } from "@/lib/dates";
import { classById, supplierById, type ProcurementLine } from "@/lib/domain";
import { money, signedDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = { float: { label: "Float (days)", color: "var(--chart-1)" } } satisfies ChartConfig;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function LineSheet({ line, onClose }: { line: ProcurementLine | null; onClose: () => void }) {
  return (
    <Sheet open={line !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {line && <LineDetail line={line} />}
      </SheetContent>
    </Sheet>
  );
}

function LineDetail({ line }: { line: ProcurementLine }) {
  const cls = classById[line.classId];
  const supplier = supplierById[line.supplierId];
  const status = statusOf(line);
  const float = floatOf(line);
  const drift = line.snapshots.map((s) => ({
    week: fmtDate(s.week, false),
    float: line.ros - s.forecast,
  }));
  const options = recoveryOptions().filter((o) => o.target.id === line.id || o.donor?.id === line.id);

  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="font-mono text-xs text-muted-foreground">PO {line.poNumber}</span>
        </div>
        <SheetTitle className="text-xl">{line.tag}</SheetTitle>
        <SheetDescription>
          {line.qty}× {cls.name} · {supplier.name} ({supplier.plant})
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-4 pb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Required on site">{fmtDate(line.ros)}</Fact>
          <Fact label="Forecast delivery">{fmtDate(line.forecastDelivery)}</Fact>
          <Fact label="Float">
            <FloatPill days={float} delivered={line.delivered} />
          </Fact>
          <Fact label="PO value">{money(line.poValue)}</Fact>
          <Fact label="Baseline delivery">{fmtDate(line.baselineDelivery)}</Fact>
          <Fact label="Slip vs baseline">{signedDays(line.forecastDelivery - line.baselineDelivery)}</Fact>
          <Fact label="Date changes (12 wk)">{forecastChanges(line)}</Fact>
          <Fact label="Feeds">{line.hallId ?? `All ${line.building} halls`}</Fact>
        </div>

        {line.note && (
          <div className="flex gap-2.5 rounded-lg border border-signal/25 bg-signal/8 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal" />
            <p>{line.note}</p>
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium">Float trend across weekly snapshots</h3>
          <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
            <LineChart data={drift} accessibilityLayer={false} margin={{ left: -18, right: 20, top: 6 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={10} interval={2} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} />
              <ReferenceLine y={0} stroke="#d23a2f" strokeDasharray="4 4" />
              <ChartTooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow">
                      <div className="text-muted-foreground">Snapshot {label}</div>
                      <div className="font-mono">{signedDays(Number(payload[0].value))} float</div>
                    </div>
                  ) : null
                }
              />
              <Line
                isAnimationActive={false}
                type="stepAfter"
                dataKey="float"
                stroke="var(--color-float)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 text-xs text-muted-foreground">
            Each point re-reads the supplier forecast as it stood that week. A falling line means the supplier keeps
            moving the date.
          </p>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-medium">Procurement milestones</h3>
          <ol className="relative ml-2 border-l">
            {line.milestones.map((m) => (
              <li key={m.name} className="mb-3 ml-4 last:mb-0">
                <span className="absolute -left-[7px] mt-0.5 rounded-full bg-background">
                  {m.actual ? (
                    <CheckCircle2 className="size-3.5 text-ok" />
                  ) : (
                    <Circle className="size-3.5 text-muted-foreground" />
                  )}
                </span>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn(!m.actual && "text-muted-foreground")}>{m.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.actual ? "" : "fcst "}
                    {fmtDate(m.date)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Submittal {line.submittal.number}</h3>
            <span
              className={cn(
                "text-xs",
                line.submittal.status === "Revise & resubmit" ? "text-risk" : "text-muted-foreground",
              )}
            >
              {line.submittal.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Fact label="Sent">{fmtDate(line.submittal.submitted)}</Fact>
            <Fact label="Approved">{line.submittal.approved ? fmtDate(line.submittal.approved) : "Open"}</Fact>
            <Fact label="Revisions">{line.submittal.revisions}</Fact>
          </div>
          {line.submittal.approved === null && (
            <div className="mt-3 flex items-center gap-2 text-xs text-risk">
              <FileWarning className="size-3.5" />
              Ball in court: {line.submittal.ballInCourt}. Fabrication release waits on approval.
            </div>
          )}
        </section>

        {options.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">Recovery options involving this line</h3>
            <div className="flex flex-col gap-2">
              {options.map((o) => (
                <div key={o.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium">{o.title}</div>
                    <div className="text-right text-xs whitespace-nowrap text-ok">{money(o.netBenefit)} net</div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
