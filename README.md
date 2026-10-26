# Path to Energization

**Live:** https://ops-intelligence-omega.vercel.app

A customer analytics control tower for long-lead electrical and mechanical equipment on a hyperscale data center build. It answers the question an owner asks every week: **which data halls will energize late, why, what does it cost, and what's the cheapest move that fixes it?**

Built by Khursheed Khan as a forward-deployed demo for Kaya AI's _Forward Deployed Engineer – Customer Analytics_ role. All project data is synthetic and generated deterministically (same seed, same numbers every time). Lead times and lease rates come from published market sources (listed below).

## The scenario

**Project Halcyon** is a 144 MW AI campus in Amarillo, TX: three buildings, twelve 12 MW data halls, 102 equipment PO lines (main power transformers, MV switchgear, unit substations, generators, UPS, chillers, CDUs, busway, fan walls). The owner is Meridian Compute and the GC is Northline Builders. The as-of date is Oct 23, 2026.

The data tells one story the demo walks through:

- The DC2 main power transformer from Halden is 33 days behind its required-on-site date. All four DC2 halls slip with it.
- The DC1-H3 generator from Prairie Gen failed factory acceptance testing, and Prairie's tracker is 9 days stale.
- In total, **$9.1M of lease revenue is at risk** and 72 MW will be late.
- The DC3 transformer from Voltaris has 185 days of float. Swapping it into DC2 protects about $7.3M. Accepting that move in the app takes revenue at risk from $9.1M to $1.8M live.

## Sheets (pages)

The UI is laid out like a construction drawing set, with sheet codes, a title block, and a revision stamp.

| Sheet | Route        | What it does                                                                                                                                             |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 | `/`          | Portfolio KPIs, energization runway (planned vs projected per hall), recovery queue you can accept, what moved in two weeks, risk trend                  |
| E-101 | `/register`  | Every PO line with float, status, and submittal state. Filters, sort, CSV export, and drill-through to a line sheet                                      |
| P-201 | `/suppliers` | Supplier scorecard, a "late and unstable" scatter, and a row-level-security supplier portal preview                                                      |
| S-301 | `/simulator` | Stress-test a supplier, class, or building, change the lease rate, and toggle recovery moves (swaps and expedites ranked by net benefit)                 |
| X-401 | `/brief`     | Weekly executive brief: decisions for the OAC meeting, hall outlook, expediting email draft, data confidence. Prints cleanly                             |
| D-501 | `/pipeline`  | Source freshness and a step-through supplier tracker sync that normalizes messy rows (Excel serials, "wk of", "late Q1 2027", TBD, bad tags, duplicates) |
| D-502 | `/model`     | Star schema, relationships, and downloadable DAX measures, Power Query, and RLS roles                                                                    |

## Power BI kit

The app is also the data source for a real Power BI model:

- `GET /api/v1` lists tables. `GET /api/v1/{table}` returns JSON, and `?format=csv` returns CSV. CORS is open.
- Tables: `fact_procurement_line`, `fact_forecast_snapshot` (weekly periodic snapshot), `fact_milestone`, `agg_hall_energization`, `dim_location`, `dim_equipment_class`, `dim_supplier`, and `dim_date`.
- `GET /powerbi/measures.dax`: Hall Slip Days, Lease Revenue at Risk, Float Lost This Week, and the other measures.
- `GET /powerbi/queries.pq`: a Power Query `GetTable` function. It uses `Web.Contents` with `RelativePath`, so scheduled refresh in the Power BI Service works without a gateway.
- `GET /powerbi/rls-roles.dax`: Owner, GC, and Supplier roles (`dim_supplier[supplier_upn] = USERPRINCIPALNAME()`).

## Domain logic

- **Float** = required-on-site date − forecast delivery. Status: below 0 is critical, up to 14 days is at risk, up to 30 is watch, otherwise on track.
- **Hall slip** is day-for-day from the worst negative float across the hall's lines plus its building's site package (transformer, switchgear). Backfeed has to land 30 days before energization.
- **Lease revenue at risk** = slip days × MW × $/kW-month × 1000 × 12 / 365. At $140/kW-month, that's about $55K per day for a 12 MW hall.
- **Recovery options** look for interchangeable equipment in a later hall with float to spare, plus expedite options (weekend shifts, air freight, witnessed retest). They're ranked by revenue protected minus cost.

### Sources for assumptions

- Wood Mackenzie, _Mind the gap_ (Q2 2025): power transformers average 128 weeks, GSUs 143 weeks, MV switchgear 44 weeks. The app's main transformer lead time is 128 weeks.
- Terrapin, 2026 lead-time ranges: MV switchgear 52–80 weeks, substation transformers 75–110, 2.5–3.5 MW diesel generators 62–82, UPS 30–48.
- CBRE, North America Data Center Trends H2 2025: 250–500 kW wholesale averages $196.25/kW/month, and 10 MW+ in Silicon Valley runs $180–275. The app's $140 default is deliberately conservative for hyperscale. You can change it on S-301.

## Run locally

```bash
npm install
npm run dev        # http://127.0.0.1:4317
```

Other scripts: `npm run build`, `npm run lint`, and `npm run format`.

## Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, choose **Add New → Project**, import the repo, and keep the defaults (Next.js preset, no environment variables).
3. Deploy. The Power BI Power Query file automatically points at whatever domain serves it.

Or run `npx vercel --prod` from the project root.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui (Base UI), and recharts. Agent-style components (recommendation cards, decision inbox, tool-call cards, change summary, email draft, notification stack, number ticker) come from the [affectUI](https://www.affectui.com/) registry and are restyled to the app's light drawing-set theme. Inter and IBM Plex Mono are the fonts.
