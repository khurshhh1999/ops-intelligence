"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, ExternalLink, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/section-title";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TABLES, type TableDef } from "@/lib/model";
import { DAX_MEASURES, RELATIONSHIPS, RLS_ROLES, powerQuery } from "@/lib/powerbi";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

function useOrigin() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "https://your-app.vercel.app",
  );
}

function CodeBlock({ code, file }: { code: string; file: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-background/60">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{file}</span>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="xs" variant="ghost" render={<a href={`/powerbi/${file}`} download />} nativeButton={false}>
            <Download data-icon="inline-start" /> Download
          </Button>
        </div>
      </div>
      <pre className="max-h-[520px] overflow-auto p-4 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TableCard({ t, rows }: { t: TableDef; rows: number }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        t.kind === "fact" && "border-signal/40 bg-signal/6",
        t.kind === "aggregate" && "border-done/30 bg-done/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-medium">{t.name}</span>
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{t.kind}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{t.grain}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {t.keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            <KeyRound className="size-2.5 text-signal" />
            {k}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{rows.toLocaleString()} rows</span>
        <span className="flex gap-2">
          <a className="text-signal hover:underline" href={`/api/v1/${t.name}`} target="_blank" rel="noreferrer">
            JSON
          </a>
          <a
            className="text-signal hover:underline"
            href={`/api/v1/${t.name}?format=csv`}
            target="_blank"
            rel="noreferrer"
          >
            CSV
          </a>
        </span>
      </div>
    </div>
  );
}

export function ModelView() {
  const origin = useOrigin();
  const [tab, setTab] = useState("dax");
  const counts = useMemo(() => Object.fromEntries(TABLES.map((t) => [t.name, t.rows().length])), []);
  const facts = TABLES.filter((t) => t.kind !== "dimension");
  const dims = TABLES.filter((t) => t.kind === "dimension");

  return (
    <>
      <PageHeader
        eyebrow="Under the hood"
        title="Semantic model & Power BI kit"
        description="One star schema behind every view in this app, served over a public API so the same model drops straight into Power BI Desktop and refreshes on a schedule in Power BI Service."
        actions={
          <Button variant="outline" render={<a href="/api/v1" target="_blank" rel="noreferrer" />} nativeButton={false}>
            <ExternalLink data-icon="inline-start" /> API index
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <SectionTitle n="01">Star schema</SectionTitle>
          <CardDescription>
            Facts carry conformed keys to every dimension, so one slicer filters the register, the snapshots, and the
            milestones together. The snapshot fact is what makes &ldquo;how did we get here&rdquo; questions answerable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr_1fr]">
            <div className="flex flex-col gap-3">
              {dims.slice(0, 2).map((t) => (
                <TableCard key={t.name} t={t} rows={counts[t.name]} />
              ))}
            </div>
            <div className="relative flex flex-col gap-3">
              {facts.map((t) => (
                <TableCard key={t.name} t={t} rows={counts[t.name]} />
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {dims.slice(2).map((t) => (
                <TableCard key={t.name} t={t} rows={counts[t.name]} />
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {RELATIONSHIPS.map(([from, to, card, state]) => (
              <div
                key={from}
                className="flex flex-wrap items-center gap-x-2 border-b border-dashed py-1 font-mono text-[11px] text-muted-foreground last:border-0 sm:border-0 sm:py-0"
              >
                <span className="break-all text-foreground">{from}</span>
                <span>→</span>
                <span className="break-all">{to}</span>
                <span className="ml-auto font-sans whitespace-nowrap">
                  {card} · {state}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          aria-label="Power BI kit"
          variant="underline"
          kind="tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "dax", label: "DAX" },
            { value: "m", label: "Power Query" },
            { value: "rls", label: "RLS roles" },
            { value: "ops", label: "Refresh" },
          ]}
        />
      </div>
      {tab === "dax" && (
        <div>
          <CodeBlock code={DAX_MEASURES} file="measures.dax" />
        </div>
      )}
      {tab === "m" && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            In Power BI Desktop: Get data → Blank query → Advanced editor. Paste the function, then one query per table.
            Base URL is this deployment.
          </p>
          <CodeBlock code={powerQuery(origin)} file="queries.pq" />
        </div>
      )}
      {tab === "rls" && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Publish one report to one workspace and share it with the owner, the GC, and every supplier. RLS decides
            what each person sees. You can preview the Supplier role on the{" "}
            <a href="/suppliers" className="text-signal hover:underline">
              supplier scorecard
            </a>
            .
          </p>
          <CodeBlock code={RLS_ROLES} file="rls-roles.dax" />
        </div>
      )}
      {tab === "ops" && (
        <div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              [
                "Scheduled refresh",
                "Daily at 05:30 CT, after the P6 and ERP nightly drops land and before the 06:00 brief. The web source needs no gateway because the base URL is static.",
              ],
              [
                "Gateway (when a customer needs one)",
                "On-prem ERP or SQL sources go through a standard-mode gateway cluster with two nodes. The Kaya API and Procore stay cloud-to-cloud.",
              ],
              [
                "Freshness guard",
                "A refresh only publishes if every publish check passes. A failed check names the source and the rule, and the brief carries a data-confidence note.",
              ],
              [
                "Templates",
                "Workspace per customer, deployment pipeline (dev → test → prod), and a .pbit template so a new project gets the same model in under an hour.",
              ],
            ].map(([t, d]) => (
              <Card key={t} size="sm">
                <CardContent>
                  <div className="text-sm font-medium">{t}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
