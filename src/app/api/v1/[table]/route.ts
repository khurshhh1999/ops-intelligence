import type { NextRequest } from "next/server";
import { TABLES, tableByName, toCsv } from "@/lib/model";

export function generateStaticParams() {
  return TABLES.map((t) => ({ table: t.name }));
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/v1/[table]">) {
  const { table } = await ctx.params;
  const def = tableByName[table];
  if (!def) {
    return Response.json({ error: `Unknown table "${table}"`, tables: TABLES.map((t) => t.name) }, { status: 404 });
  }
  const rows = def.rows();
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (req.nextUrl.searchParams.get("format") === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="${def.name}.csv"`,
      },
    });
  }
  return Response.json({ table: def.name, grain: def.grain, rowCount: rows.length, rows }, { headers });
}
