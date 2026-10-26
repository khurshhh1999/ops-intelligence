import { TABLES } from "./model";

export const DAX_MEASURES = `// ===== Core counts =====
Lines = COUNTROWS ( fact_procurement_line )

Committed Value = SUM ( fact_procurement_line[po_value] )

Critical Lines =
CALCULATE (
    [Lines],
    fact_procurement_line[float_days] < 0,
    fact_procurement_line[is_delivered] = FALSE ()
)

At Risk Lines =
CALCULATE (
    [Lines],
    fact_procurement_line[float_days] >= 0,
    fact_procurement_line[float_days] <= 14,
    fact_procurement_line[is_delivered] = FALSE ()
)

// ===== Supplier performance =====
On-Time Rate =
DIVIDE ( CALCULATE ( [Lines], fact_procurement_line[slip_days] <= 7 ), [Lines] )

Median Submittal Cycle (days) =
MEDIAN ( fact_procurement_line[submittal_cycle_days] )

First-Pass Submittal Rate =
DIVIDE (
    CALCULATE ( [Lines], fact_procurement_line[submittal_revisions] = 0,
        NOT ISBLANK ( fact_procurement_line[submittal_cycle_days] ) ),
    CALCULATE ( [Lines], NOT ISBLANK ( fact_procurement_line[submittal_cycle_days] ) )
)

// ===== Energization impact =====
// 'Lease Rate' is a what-if parameter table (100..250, default 140)
Lease Rate = SELECTEDVALUE ( 'Lease Rate'[Lease Rate], 140 )

Revenue per MW-Day = [Lease Rate] * 1000 * 12 / 365

// A hall slips day-for-day with the worst negative float among the lines that
// feed it: its own equipment plus its building's site/utility package.
Hall Slip Days =
VAR HallKey = SELECTEDVALUE ( dim_location[location_key] )
VAR Building = SELECTEDVALUE ( dim_location[building] )
VAR WorstFloat =
    CALCULATE (
        MIN ( fact_procurement_line[float_days] ),
        REMOVEFILTERS ( dim_location ),
        dim_location[location_key] IN { HallKey, Building & "-SITE" },
        fact_procurement_line[is_delivered] = FALSE ()
    )
RETURN
    IF ( NOT ISBLANK ( HallKey ), MAX ( 0, - WorstFloat ) )

Lease Revenue at Risk =
SUMX (
    FILTER ( VALUES ( dim_location[location_key] ), CALCULATE ( SUM ( dim_location[it_mw] ) ) > 0 ),
    [Hall Slip Days] * CALCULATE ( SUM ( dim_location[it_mw] ) ) * [Revenue per MW-Day]
)

MW Energizing Late =
SUMX (
    FILTER ( VALUES ( dim_location[location_key] ), [Hall Slip Days] > 0 ),
    CALCULATE ( SUM ( dim_location[it_mw] ) )
)

// ===== Forecast drift (periodic snapshot) =====
Float Lost This Week =
VAR LastSnap = MAX ( fact_forecast_snapshot[snapshot_date_key] )
VAR PrevSnap =
    CALCULATE (
        MAX ( fact_forecast_snapshot[snapshot_date_key] ),
        fact_forecast_snapshot[snapshot_date_key] < LastSnap
    )
RETURN
    CALCULATE ( SUM ( fact_forecast_snapshot[float_days] ), fact_forecast_snapshot[snapshot_date_key] = PrevSnap )
        - CALCULATE ( SUM ( fact_forecast_snapshot[float_days] ), fact_forecast_snapshot[snapshot_date_key] = LastSnap )

Forecast Changes (12 wk) =
SUMX (
    VALUES ( fact_forecast_snapshot[line_key] ),
    CALCULATE ( DISTINCTCOUNT ( fact_forecast_snapshot[forecast_date_key] ) ) - 1
)
`;

export const RLS_ROLES = `// Role: Supplier  (table: dim_supplier)
[supplier_upn] = USERPRINCIPALNAME ()

// Role: Building PM  (table: dim_location)
// security_building_access maps each PM's UPN to the buildings they run
[building]
    IN CALCULATETABLE (
        VALUES ( security_building_access[building] ),
        security_building_access[upn] = USERPRINCIPALNAME ()
    )

// Role: Owner Executive
// No filter. Sees the full campus.
`;

const TYPES: Record<string, string> = {
  fact_procurement_line: `{{"qty", Int64.Type}, {"po_value", Currency.Type}, {"float_days", Int64.Type}, {"slip_days", Int64.Type}, {"submittal_revisions", Int64.Type}, {"submittal_cycle_days", Int64.Type}, {"is_delivered", type logical}}`,
  fact_forecast_snapshot: `{{"float_days", Int64.Type}}`,
  fact_milestone: `{{"milestone_seq", Int64.Type}, {"is_actual", type logical}}`,
  agg_hall_energization: `{{"slip_days", Int64.Type}, {"lease_revenue_at_risk", Currency.Type}}`,
  dim_location: `{{"it_mw", Int64.Type}}`,
  dim_equipment_class: `{{"contract_lead_weeks", Int64.Type}, {"install_days", Int64.Type}}`,
  dim_supplier: `{}`,
  dim_date: `{{"date", type date}, {"week_start", type date}, {"year", Int64.Type}}`,
};

export function powerQuery(baseUrl: string) {
  const queries = TABLES.map(
    (t) => `// Query: ${t.name}
let
    Source = GetTable("${t.name}"),
    Typed = Table.TransformColumnTypes(Source, ${TYPES[t.name] ?? "{}"})
in
    Typed`,
  ).join("\n\n");
  return `// Function query: GetTable
// RelativePath keeps the base URL static, so Power BI Service can refresh this
// web source on a schedule without an on-premises gateway.
(name as text) as table =>
let
    Source = Csv.Document(
        Web.Contents("${baseUrl}", [RelativePath = "api/v1/" & name, Query = [format = "csv"]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Promoted

${queries}
`;
}

export const RELATIONSHIPS = [
  ["fact_procurement_line[class_key]", "dim_equipment_class[class_key]", "*:1", "active"],
  ["fact_procurement_line[supplier_key]", "dim_supplier[supplier_key]", "*:1", "active"],
  ["fact_procurement_line[location_key]", "dim_location[location_key]", "*:1", "active"],
  ["fact_procurement_line[forecast_date_key]", "dim_date[date_key]", "*:1", "active"],
  ["fact_procurement_line[ros_date_key]", "dim_date[date_key]", "*:1", "inactive · USERELATIONSHIP"],
  ["fact_forecast_snapshot[snapshot_date_key]", "dim_date[date_key]", "*:1", "active"],
  ["fact_forecast_snapshot[class|supplier|location_key]", "conformed dimensions", "*:1", "active"],
  ["fact_milestone[milestone_date_key]", "dim_date[date_key]", "*:1", "active"],
  ["agg_hall_energization[location_key]", "dim_location[location_key]", "1:1", "active"],
] as const;
