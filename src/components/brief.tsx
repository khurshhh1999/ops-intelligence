"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Printer } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChangeSummary } from "@/components/ui/change-summary";
import { DecisionInbox } from "@/components/ui/decision-inbox";
import { EmailDraft } from "@/components/ui/email-draft";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { floatOf, portfolioKpis, recoveryOptions, supplierScorecard, type RecoveryOption } from "@/lib/analytics";
import { LINES } from "@/lib/dataset";
import { fmtDate } from "@/lib/dates";
import { PROJECT, supplierById } from "@/lib/domain";
import { money } from "@/lib/format";
import { TRACKER_AGE_DAYS, runTrackerBatch } from "@/lib/pipeline";

const LOOKBACK_WEEKS = 2;

function useBrief() {
  return useMemo(() => {
    const k = portfolioKpis();
    const decisions: RecoveryOption[] = [];
    const used = new Set<string>();
    for (const o of recoveryOptions()) {
      if (used.has(o.target.id) || (o.donor && used.has(o.donor.id))) continue;
      decisions.push(o);
      used.add(o.target.id);
      if (o.donor) used.add(o.donor.id);
    }
    const n = LINES[0].snapshots.length;
    const changes = LINES.map((l) => ({
      line: l,
      delta: l.snapshots[n - 1].forecast - l.snapshots[n - 1 - LOOKBACK_WEEKS].forecast,
    }))
      .filter((c) => c.delta !== 0)
      .sort((a, b) => b.delta - a.delta);
    const watch = supplierScorecard().filter((s) => s.critical > 0 || TRACKER_AGE_DAYS[s.supplier.id] > 7);
    const held = runTrackerBatch().filter((r) => r.outcome !== "published").length;
    const gen = LINES.find((l) => l.id === "DC1-H3-GEN")!;
    return { k, decisions, changes, watch, held, gen };
  }, []);
}

export function Brief() {
  const { k, decisions, changes, watch, held, gen } = useBrief();
  const [copied, setCopied] = useState(false);
  const lateHalls = k.halls.filter((h) => h.slipDays > 0);
  const protectedTotal = decisions.reduce((s, d) => s + d.revenueProtected, 0);

  const drivers = new Set(lateHalls.map((h) => h.driver?.id)).size;
  const headline = `${lateHalls.length} of ${k.halls.length} data halls are forecast to energize late, deferring ${money(
    k.revenueAtRisk,
  )} of lease revenue. ${drivers} long-lead ${drivers === 1 ? "line drives" : "lines drive"} all of it. The recovery moves below protect ${money(
    Math.min(protectedTotal, k.revenueAtRisk),
  )} if approved this week.`;

  function asText() {
    return [
      `${PROJECT.name}: weekly equipment risk brief (data as of ${fmtDate(PROJECT.asOf)})`,
      "",
      headline,
      "",
      "Decisions needed:",
      ...decisions.map(
        (d, i) => `${i + 1}. ${d.title}: protects ${money(d.revenueProtected)} for ${money(d.cost)}. ${d.caveat ?? ""}`,
      ),
      "",
      "Halls forecast late:",
      ...lateHalls.map(
        (h) =>
          `- ${h.id}: ${fmtDate(h.plannedEnergization)} → ${fmtDate(h.projected)} (+${h.slipDays}d), driven by ${h.driver?.tag}`,
      ),
      "",
      `Data quality: ${held} supplier tracker rows held back for review; Prairie Gen Power tracker is ${TRACKER_AGE_DAYS.PRAIRIE} days old.`,
    ].join("\n");
  }

  return (
    <>
      <PageHeader
        eyebrow="Generated from the model every Monday 6:00 AM CT"
        title="Weekly executive brief"
        description="The one page an owner's project executive reads before the OAC meeting. Every number links back to the same semantic model as the dashboards."
        actions={
          <div className="no-print flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(asText());
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check data-icon="inline-start" /> : <ClipboardCopy data-icon="inline-start" />}
              {copied ? "Copied" : "Copy as email"}
            </Button>
            <Button onClick={() => window.print()}>
              <Printer data-icon="inline-start" /> Print / PDF
            </Button>
          </div>
        }
      />

      <Card className="print-light mx-auto max-w-4xl">
        <CardContent className="flex flex-col gap-8 p-6 sm:p-10">
          <header className="flex flex-col gap-1 border-b pb-6">
            <div className="text-xs tracking-wide text-muted-foreground uppercase">
              {PROJECT.name} · {PROJECT.campus} · week of {fmtDate(PROJECT.asOf - 4)}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Equipment risk to energization</h2>
            <p className="mt-2 text-base leading-relaxed">{headline}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Revenue at risk", money(k.revenueAtRisk)],
                ["MW late", `${k.mwLate} of ${PROJECT.itMw}`],
                ["Critical lines", String(k.critical)],
                ["Open submittals", String(k.openSubmittals)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="text-[11px] text-muted-foreground">{l}</div>
                  <div className="text-xl font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="sheet-label mb-2 text-muted-foreground">Decisions needed this week</h3>
              <DecisionInbox
                decisions={decisions.map((d, i) => ({
                  id: d.id,
                  title: d.title,
                  detail: `Protects ${money(d.revenueProtected)} for about ${money(d.cost)}. ${d.caveat ?? ""}`,
                  primary: "Approve",
                  secondary: "Take to OAC",
                  collapsed: i > 1,
                }))}
              />
            </div>
            <div>
              <h3 className="sheet-label mb-2 text-muted-foreground">Forecast changes</h3>
              {changes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No supplier moved a date.</p>
              ) : (
                <ChangeSummary
                  title="Supplier dates that moved"
                  period={`Last ${LOOKBACK_WEEKS} weeks`}
                  changes={changes.slice(0, 6).map(({ line, delta }) => ({
                    label: `${line.tag} · ${supplierById[line.supplierId].name.split(" ")[0]}`,
                    change: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}d · ${floatOf(line) < 0 ? `${-floatOf(line)}d late` : `${floatOf(line)}d float`}`,
                    tone: delta > 0 ? "bad" : "good",
                    direction: delta > 0 ? "down" : "up",
                  }))}
                />
              )}
            </div>
          </section>

          <section>
            <h3 className="sheet-label mb-3 text-muted-foreground">Hall outlook</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hall</TableHead>
                  <TableHead>Planned</TableHead>
                  <TableHead>Projected</TableHead>
                  <TableHead className="text-right">Slip</TableHead>
                  <TableHead className="hidden sm:table-cell">Driver</TableHead>
                  <TableHead className="text-right">Deferred revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {k.halls.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">{h.id}</TableCell>
                    <TableCell>{fmtDate(h.plannedEnergization)}</TableCell>
                    <TableCell className={h.slipDays ? "text-crit" : ""}>{fmtDate(h.projected)}</TableCell>
                    <TableCell className="text-right font-mono">{h.slipDays ? `+${h.slipDays}d` : "—"}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {h.slipDays ? h.driver?.tag : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {h.revenueAtRisk ? money(h.revenueAtRisk) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="no-print">
            <h3 className="sheet-label mb-2 text-muted-foreground">Drafted follow-up</h3>
            <EmailDraft
              reference={`PO ${gen.poNumber}`}
              account={`${supplierById[gen.supplierId].name} · ${gen.tag}`}
              amount={money(gen.poValue)}
              status={`${-floatOf(gen)} days late`}
              agent="Drafted from this brief"
              contacts={[
                { name: "Dana Kowalski", email: "expediting@prairie.example.com" },
                { name: "Marcus Lee", email: "m.lee@prairie.example.com" },
                { name: "Northline procurement", email: "procurement@northline.example.com" },
              ]}
              attachment={`${gen.tag}_float-trend.pdf`}
              tones={[
                {
                  id: "firm",
                  label: "Firm",
                  body: (c) =>
                    `Hi ${c.name.split(" ")[0]}, the five 3.25 MW gensets on PO ${gen.poNumber} are now forecast for ${fmtDate(gen.forecastDelivery)}, ${-floatOf(gen)} days past the ${fmtDate(gen.ros)} required-on-site date for DC1 Hall 3. That pushes energization day for day. Please send a confirmed FAT retest date and recovery schedule by Wednesday, and update your tracker (last received ${TRACKER_AGE_DAYS.PRAIRIE} days ago). Float trend attached.`,
                },
                {
                  id: "collab",
                  label: "Collaborative",
                  body: (c) =>
                    `Hi ${c.name.split(" ")[0]}, thanks for the update on the alternator vibration retest. We're now showing the DC1 Hall 3 gensets ${-floatOf(gen)} days behind the date they're needed on site. Can we get 20 minutes this week to walk through options, including a weekend retest or shipping the Hall 4 units first? Float trend attached.`,
                },
                {
                  id: "escalate",
                  label: "Escalate",
                  body: (c) =>
                    `Dear ${c.name}, PO ${gen.poNumber} (DC1-H3 gensets) has moved twice this quarter and now sits ${-floatOf(gen)} days past its required-on-site date, putting a 12 MW data hall's energization at risk. We are requesting an executive call within 48 hours and a written recovery plan with a committed ship date.`,
                },
              ]}
              link={{ label: "Live float trend", href: "https://halcyon.example.com/register" }}
            />
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="sheet-label mb-3 text-muted-foreground">Supplier watchlist</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {watch.map((s) => (
                  <li key={s.supplier.id}>
                    <span className="font-medium">{s.supplier.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {Math.round(s.onTimeRate * 100)}% on time · {s.dateChanges} date changes
                      {s.critical > 0 && ` · ${s.critical} critical`}
                      {TRACKER_AGE_DAYS[s.supplier.id] > 7 && ` · tracker ${TRACKER_AGE_DAYS[s.supplier.id]}d stale`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="sheet-label mb-3 text-muted-foreground">Data confidence</h3>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>
                  Four of five sources refreshed on schedule; ERP and P6 reconcile to the PO register. Supplier trackers
                  are past their weekly SLA.
                </li>
                <li>
                  {held} supplier tracker rows held back for review (unparseable dates, quantity mismatches,
                  duplicates).
                </li>
                <li>
                  Prairie Gen Power has not sent a tracker in {TRACKER_AGE_DAYS.PRAIRIE} days; treat DC1-H3 generator
                  dates as low confidence.
                </li>
              </ul>
            </div>
          </section>
        </CardContent>
      </Card>
    </>
  );
}
