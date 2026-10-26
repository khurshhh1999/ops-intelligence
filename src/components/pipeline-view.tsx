"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Clock, Play, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/section-title";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { NotificationStack } from "@/components/ui/notification-stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ThinkingLoader } from "@/components/ui/thinking-loader";
import { ToolCallCard, ToolCallGroup } from "@/components/ui/tool-call-card";
import { fmtDate } from "@/lib/dates";
import { RAW_TRACKER_ROWS, RECONCILIATION, SOURCES, runTrackerBatch, type ProcessedRow } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const STEP_MS = 700;

function buildSteps(results: ProcessedRow[]) {
  const by = (o: ProcessedRow["outcome"]) => results.filter((r) => r.outcome === o);
  const conf = (c: string) => results.filter((r) => r.parsed.confidence === c).length;
  return [
    {
      name: "extract_supplier_trackers",
      phase: "Reading supplier mailboxes",
      summary: `Read ${new Set(results.map((r) => r.file)).size} files, ${results.length} rows`,
      args: { mailbox: "expediting@halcyon-project", since: "2026-10-22T06:00:00-05:00", attachments: ["xlsx", "csv"] },
      result: { files: [...new Set(results.map((r) => r.file))], rows: results.length },
    },
    {
      name: "parse_ship_dates",
      phase: "Parsing ship dates",
      summary: `${conf("exact")} exact, ${conf("week")} week-level, ${conf("approximate")} approximate, ${conf("none")} unusable`,
      args: { formats: ["excel_serial", "us_mdy", "iso_8601", "dd-Mon-yyyy", "week_of", "iso_week", "quarter_phrase"] },
      result: results.map((r) => ({ raw: r.rawShip, rule: r.parsed.rule, confidence: r.parsed.confidence })),
    },
    {
      name: "crosswalk_tags",
      phase: "Matching tags to PO lines",
      summary: `${results.filter((r) => r.match.lineId).length} of ${results.length} tags matched to a PO line`,
      args: { target: "fact_procurement_line.line_key", strategy: "class keyword + building + hall" },
      result: results.map((r) => ({ raw: r.rawTag, line_key: r.match.lineId, rule: r.match.rule })),
    },
    {
      name: "validate_against_po_register",
      phase: "Checking quantities and duplicates",
      summary: `${by("quarantined").length} rows fail validation`,
      args: { checks: ["qty_matches_po", "duplicate_fingerprint", "date_is_commitment", "line_exists"] },
      result: by("quarantined").map((r) => ({ raw: r.rawTag, reason: r.reason })),
    },
    {
      name: "publish_to_model",
      phase: "Publishing to the model",
      summary: `${by("published").length} published, ${by("review").length} to review, ${by("quarantined").length} held back`,
      args: { table: "fact_forecast_snapshot", mode: "upsert", refresh: "powerbi:dataset/halcyon" },
      result: {
        published: by("published").length,
        needs_review: by("review").length,
        held_back: by("quarantined").length,
        refresh: "queued",
      },
    },
  ];
}

function age(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const OUTCOME_STYLE: Record<ProcessedRow["outcome"], string> = {
  published: "text-ok",
  review: "text-watch",
  quarantined: "text-crit",
};

export function PipelineView() {
  const [step, setStep] = useState(-1);
  const [runId, setRunId] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const results = useMemo(() => runTrackerBatch(), []);
  const STEPS = useMemo(() => buildSteps(results), [results]);
  const done = step >= STEPS.length;
  const counts = {
    published: results.filter((r) => r.outcome === "published").length,
    review: results.filter((r) => r.outcome === "review").length,
    quarantined: results.filter((r) => r.outcome === "quarantined").length,
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function run() {
    if (timer.current) clearInterval(timer.current);
    setStep(0);
    setRunId((n) => n + 1);
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= STEPS.length && timer.current) clearInterval(timer.current);
        return s + 1;
      });
    }, STEP_MS);
  }

  return (
    <>
      <PageHeader
        eyebrow="Under the hood"
        title="Data pipeline & freshness"
        description="Five customer sources feed one model. Bad rows are held back with a reason so the dashboard never shows a date nobody committed to."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {SOURCES.map((s) => {
          const stale = s.hoursSinceSync > s.slaHours;
          return (
            <Card key={s.id} size="sm" className={cn(stale && "ring-crit/40")}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{s.system}</span>
                  {stale ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-crit">
                      <CircleAlert className="size-3.5" /> SLA breach
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ok">
                      <CheckCircle2 className="size-3.5" /> Fresh
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.feeds}</div>
                <div className="mt-auto flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> {age(s.hoursSinceSync)}
                  </span>
                  <span>{s.records.toLocaleString()} records</span>
                </div>
                {s.issue && <div className={cn("text-[11px]", stale ? "text-crit" : "text-watch")}>{s.issue}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="pb-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionTitle n="01">Supplier tracker batch</SectionTitle>
              <CardDescription>
                Nine suppliers email spreadsheets in nine formats. This is this morning&apos;s batch, exactly as it
                arrived.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {step >= 0 && (
                <ThinkingLoader
                  key={runId}
                  size="sm"
                  phases={STEPS.map((x) => x.phase)}
                  phase={Math.min(step, STEPS.length - 1)}
                  done={done}
                  doneLabel={() => `Synced in ${((STEPS.length * STEP_MS) / 1000).toFixed(1)}s`}
                />
              )}
              <Button onClick={run} disabled={step >= 0 && !done}>
                <Play data-icon="inline-start" />
                {done ? "Re-run sync" : "Run sync"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-0">
            {step >= 0 && (
              <div className="mx-4" key={runId}>
                <ToolCallGroup
                  defaultOpen
                  label={`Ran ${STEPS.length} pipeline steps`}
                  runningLabel="Syncing supplier trackers"
                  duration={done ? STEPS.length * STEP_MS : undefined}
                >
                  {STEPS.slice(0, Math.min(step + 1, STEPS.length)).map((x, i) => (
                    <ToolCallCard
                      key={x.name}
                      name={x.name}
                      summary={x.summary}
                      status={i < step ? "success" : "running"}
                      duration={i < step ? STEP_MS : undefined}
                      args={x.args}
                      result={i < step ? x.result : undefined}
                      maxCodeHeight={180}
                    />
                  ))}
                </ToolCallGroup>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Supplier tag (raw)</TableHead>
                  <TableHead>Ship date (raw)</TableHead>
                  <TableHead className="hidden md:table-cell">Qty</TableHead>
                  {done && (
                    <>
                      <TableHead>Parsed</TableHead>
                      <TableHead className="hidden lg:table-cell">Mapped to</TableHead>
                      <TableHead className="pr-4">Outcome</TableHead>
                    </>
                  )}
                  {!done && <TableHead className="hidden pr-4 lg:table-cell">File</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(done ? results : RAW_TRACKER_ROWS).map((r, i) => {
                  const p = done ? (r as ProcessedRow) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="pl-4 font-mono text-xs">{r.rawTag}</TableCell>
                      <TableCell className="font-mono text-xs">{r.rawShip}</TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">{r.rawQty}</TableCell>
                      {p && (
                        <>
                          <TableCell className="text-xs">
                            {p.parsed.date !== null ? fmtDate(p.parsed.date) : "—"}
                            <div className="text-[10px] text-muted-foreground">{p.parsed.rule}</div>
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs lg:table-cell">
                            {p.match.lineId ?? <span className="font-sans text-muted-foreground">no match</span>}
                          </TableCell>
                          <TableCell className="pr-4 text-xs whitespace-normal">
                            <span className={cn("inline-flex items-start gap-1", OUTCOME_STYLE[p.outcome])}>
                              {p.outcome === "published" ? (
                                <CheckCircle2 className="mt-px size-3.5 shrink-0" />
                              ) : p.outcome === "review" ? (
                                <CircleAlert className="mt-px size-3.5 shrink-0" />
                              ) : (
                                <XCircle className="mt-px size-3.5 shrink-0" />
                              )}
                              <span>{p.reason}</span>
                            </span>
                          </TableCell>
                        </>
                      )}
                      {!p && (
                        <TableCell className="hidden pr-4 text-xs text-muted-foreground lg:table-cell">
                          {r.file}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <NotificationStack
            notices={[
              {
                id: "prairie",
                badge: "Freshness SLA",
                title: "Prairie Gen Power tracker is 9 days old",
                text: "DC1-H3 generator dates are already 23 days late and now unconfirmed. The brief flags them as low confidence until a new tracker lands.",
                pattern: "rays",
                action: { label: "Open the drafted follow-up", href: "/brief" },
              },
              {
                id: "held",
                badge: "Held back",
                title: `${counts.quarantined} tracker rows did not publish`,
                text: "A TBD date, a partial shipment, a duplicate row and a tag for a building that doesn't exist. Each one keeps its reason so the supplier can fix and resend.",
                pattern: "grid",
              },
              {
                id: "cascade",
                badge: "Submittal",
                title: "Cascade CDU submittal on its third revision",
                text: "Fabrication for DC1-H1 coolant distribution units can't release until the wetted-materials list is approved.",
                pattern: "orbit",
                action: { label: "See it in the register", href: "/register" },
              },
            ]}
          />
          <Card>
            <CardHeader>
              <SectionTitle n="02">Publish checks</SectionTitle>
              <CardDescription>
                Run before every refresh. A failed check blocks the refresh or flags the brief.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {RECONCILIATION.map((c) => (
                <div key={c.check} className="flex gap-2.5 text-sm">
                  {c.pass ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-crit" />
                  )}
                  <div>
                    <div>{c.check}</div>
                    <div className={cn("text-xs", c.pass ? "text-muted-foreground" : "text-crit")}>{c.result}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
