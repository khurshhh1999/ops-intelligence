"use client";

import type { HallProjection } from "@/lib/analytics";
import { day, fmtDate, fmtMonth, iso } from "@/lib/dates";
import { classById } from "@/lib/domain";
import type { ProcurementLine } from "@/lib/domain";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function monthStarts(from: number, to: number) {
  const out: number[] = [];
  let [y, m] = iso(from).split("-").map(Number);
  for (;;) {
    const d = day(`${y}-${String(m).padStart(2, "0")}-01`);
    if (d > to) break;
    if (d >= from) out.push(d);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function EnergizationRunway({
  halls,
  baseline,
  onSelectLine,
}: {
  halls: HallProjection[];
  /** Optional comparison projection, drawn as a ghost marker (used by the simulator). */
  baseline?: HallProjection[];
  onSelectLine?: (line: ProcurementLine) => void;
}) {
  const all = [...halls, ...(baseline ?? [])];
  const from = Math.min(...all.map((h) => h.plannedEnergization)) - 25;
  const to = Math.max(...all.map((h) => h.projected)) + 25;
  const x = (d: number) => `${((d - from) / (to - from)) * 100}%`;
  const ticks = monthStarts(from, to);

  return (
    <div className="w-full">
      <div className="grid grid-cols-[88px_1fr_96px] items-center gap-x-3 text-[11px] text-muted-foreground sm:grid-cols-[112px_1fr_150px]">
        <div />
        <div className="relative h-5">
          {ticks
            .filter((t) => (Number(iso(t).slice(5, 7)) - 1) % 3 === 0)
            .map((t) => (
              <span
                key={t}
                className={cn(
                  "absolute -translate-x-1/2 whitespace-nowrap",
                  (Number(iso(t).slice(5, 7)) - 1) % 6 !== 0 && "hidden sm:inline",
                )}
                style={{ left: x(t) }}
              >
                {fmtMonth(t)}
              </span>
            ))}
        </div>
        <div className="text-right">Slip · driver</div>
      </div>

      <div className="mt-1 flex flex-col">
        {halls.map((h, idx) => {
          const prev = baseline?.find((b) => b.id === h.id);
          const late = h.slipDays > 0;
          const newBuilding = idx > 0 && halls[idx - 1].building !== h.building;
          return (
            <div
              key={h.id}
              className={cn(
                "grid grid-cols-[88px_1fr_96px] items-center gap-x-3 py-1.5 sm:grid-cols-[112px_1fr_150px]",
                newBuilding && "mt-1.5 border-t border-dashed pt-3",
              )}
            >
              <div className="text-xs">
                <span className="font-medium">{h.building}</span>
                <span className="text-muted-foreground"> · Hall {h.hall}</span>
                <div className="text-[10px] text-muted-foreground">{h.mw} MW IT</div>
              </div>

              <div className="relative h-7">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-border/60" style={{ left: x(t) }} />
                ))}
                <span className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-border" />
                {prev && prev.projected !== h.projected && (
                  <span
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-muted-foreground/70"
                    style={{ left: x(prev.projected) }}
                  />
                )}
                {late && (
                  <span
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-crit/25 to-crit"
                    style={{
                      left: x(h.plannedEnergization),
                      width: `calc(${x(h.projected)} - ${x(h.plannedEnergization)})`,
                    }}
                  />
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/70 bg-background"
                        style={{ left: x(h.plannedEnergization) }}
                      />
                    }
                  />
                  <TooltipContent>Planned energization {fmtDate(h.plannedEnergization)}</TooltipContent>
                </Tooltip>
                {late && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => h.driver && onSelectLine?.(h.driver)}
                          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-crit shadow-[0_0_0_4px_rgba(210,58,47,0.16)]"
                          style={{ left: x(h.projected) }}
                          aria-label={`Projected ${fmtDate(h.projected)}`}
                        />
                      }
                    />
                    <TooltipContent>
                      Projected {fmtDate(h.projected)} · {money(h.revenueAtRisk)} lease revenue deferred
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="text-right text-xs">
                {late ? (
                  <button
                    type="button"
                    onClick={() => h.driver && onSelectLine?.(h.driver)}
                    title={h.driver?.tag}
                    className="group inline-flex flex-col items-end"
                  >
                    <span className="font-mono font-semibold text-crit">+{h.slipDays}d</span>
                    <span className="text-[10px] whitespace-nowrap text-muted-foreground group-hover:text-foreground group-hover:underline">
                      <span className="hidden sm:inline">
                        {h.driver ? classById[h.driver.classId].name.split(" (")[0] : ""}
                      </span>
                      <span className="font-mono sm:hidden">{h.driver?.tag}</span>
                    </span>
                  </button>
                ) : (
                  <span className="text-[11px] text-ok">holds · {h.driverFloat}d float</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-foreground/70" /> Planned (P6 baseline)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-crit" /> Projected from equipment forecasts
        </span>
        {baseline && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-dashed border-muted-foreground" /> Before scenario
          </span>
        )}
      </div>
    </div>
  );
}
