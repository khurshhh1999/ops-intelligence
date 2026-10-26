"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Download, PackageSearch, Search } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { FilterSelect } from "@/components/filter-select";
import { LineSheet } from "@/components/line-sheet";
import { FloatPill, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RISK_ORDER, floatOf, forecastChanges, statusOf } from "@/lib/analytics";
import { LINES } from "@/lib/dataset";
import { fmtDate, iso } from "@/lib/dates";
import { BUILDINGS, CLASSES, SUPPLIERS, classById, supplierById, type ProcurementLine } from "@/lib/domain";
import { money } from "@/lib/format";
import { toCsv } from "@/lib/model";

type SortKey = "float" | "value" | "ros";

export function Register() {
  const [q, setQ] = useState("");
  const [building, setBuilding] = useState("all");
  const [cls, setCls] = useState("all");
  const [status, setStatus] = useState("open");
  const [supplier, setSupplier] = useState("all");
  const [sort, setSort] = useState<SortKey>("float");
  const [selected, setSelected] = useState<ProcurementLine | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LINES.filter((l) => {
      const s = statusOf(l);
      if (building !== "all" && l.building !== building) return false;
      if (cls !== "all" && l.classId !== cls) return false;
      if (supplier !== "all" && l.supplierId !== supplier) return false;
      if (status === "open" && s === "Delivered") return false;
      if (status === "risk" && !(s === "Critical" || s === "At risk")) return false;
      if (status !== "all" && status !== "open" && status !== "risk" && s !== status) return false;
      if (
        needle &&
        ![l.tag, l.poNumber, classById[l.classId].name, supplierById[l.supplierId].name, l.submittal.number]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    }).sort((a, b) =>
      sort === "float" ? floatOf(a) - floatOf(b) : sort === "value" ? b.poValue - a.poValue : a.ros - b.ros,
    );
  }, [q, building, cls, status, supplier, sort]);

  const total = rows.reduce((s, l) => s + l.poValue, 0);

  function exportCsv() {
    const csv = toCsv(
      rows.map((l) => ({
        tag: l.tag,
        po_number: l.poNumber,
        equipment: classById[l.classId].name,
        supplier: supplierById[l.supplierId].name,
        qty: l.qty,
        po_value: Math.round(l.poValue),
        required_on_site: iso(l.ros),
        forecast_delivery: iso(l.forecastDelivery),
        float_days: floatOf(l),
        status: statusOf(l),
        submittal_status: l.submittal.status,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `halcyon-equipment-register-${iso(LINES[0].snapshots.at(-1)!.week)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="Drill-through"
        title="Equipment register"
        description="Every long-lead PO line with its required-on-site date from P6, the supplier's latest forecast, and the float between them."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download data-icon="inline-start" /> Export {rows.length} rows
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tag, PO, supplier, submittal"
            className="pl-8"
          />
        </div>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "Not yet delivered" },
            { value: "risk", label: "Critical + at risk" },
            { value: "all", label: "All statuses" },
            ...RISK_ORDER.map((s) => ({ value: s, label: s })),
          ]}
        />
        <FilterSelect
          label="Building"
          value={building}
          onChange={setBuilding}
          options={[{ value: "all", label: "All buildings" }, ...BUILDINGS.map((b) => ({ value: b, label: b }))]}
        />
        <FilterSelect
          label="Equipment class"
          value={cls}
          onChange={setCls}
          className="min-w-44"
          options={[
            { value: "all", label: "All equipment" },
            ...CLASSES.map((c) => ({ value: c.id, label: c.name.split(" (")[0] })),
          ]}
        />
        <FilterSelect
          label="Supplier"
          value={supplier}
          onChange={setSupplier}
          className="min-w-44"
          options={[
            { value: "all", label: "All suppliers" },
            ...SUPPLIERS.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: "float", label: "Sort: lowest float" },
            { value: "ros", label: "Sort: needed soonest" },
            { value: "value", label: "Sort: largest PO" },
          ]}
        />
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowDownUp className="size-3.5" />
        {rows.length} lines · {money(total)} committed · click a row for milestones, submittal status, and recovery
        options
      </div>

      <Card className="py-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <PackageSearch className="size-8 text-muted-foreground" />
            <div className="font-medium">No equipment matches these filters</div>
            <Button
              variant="link"
              onClick={() => {
                setQ("");
                setBuilding("all");
                setCls("all");
                setSupplier("all");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tag</TableHead>
                <TableHead className="hidden md:table-cell">Equipment</TableHead>
                <TableHead className="hidden lg:table-cell">Supplier</TableHead>
                <TableHead className="hidden sm:table-cell">Required on site</TableHead>
                <TableHead className="hidden sm:table-cell">Forecast</TableHead>
                <TableHead className="text-right">Float</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Submittal</TableHead>
                <TableHead className="hidden pr-4 text-right xl:table-cell">PO value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const changes = forecastChanges(l);
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelected(l)}>
                    <TableCell className="pl-4 font-mono text-xs">
                      {l.tag}
                      {changes >= 2 && (
                        <span className="ml-1.5 rounded bg-risk/15 px-1 py-0.5 font-sans text-[10px] text-risk">
                          {changes} date changes
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {l.qty}× {classById[l.classId].name.split(" (")[0]}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {supplierById[l.supplierId].name}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{fmtDate(l.ros)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{fmtDate(l.forecastDelivery)}</TableCell>
                    <TableCell className="text-right">
                      <FloatPill days={floatOf(l)} delivered={l.delivered} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={statusOf(l)} />
                    </TableCell>
                    <TableCell className="hidden text-xs xl:table-cell">
                      <span
                        className={l.submittal.status === "Revise & resubmit" ? "text-risk" : "text-muted-foreground"}
                      >
                        {l.submittal.status}
                        {l.submittal.revisions > 0 && ` · rev ${l.submittal.revisions}`}
                      </span>
                    </TableCell>
                    <TableCell className="hidden pr-4 text-right font-mono text-xs xl:table-cell">
                      {money(l.poValue)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <LineSheet line={selected} onClose={() => setSelected(null)} />
    </>
  );
}
