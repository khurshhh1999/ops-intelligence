import { TABLES } from "@/lib/model";
import { PROJECT } from "@/lib/domain";
import { iso } from "@/lib/dates";

export async function GET() {
  return Response.json({
    project: PROJECT.name,
    asOf: iso(PROJECT.asOf),
    formats: ["json", "csv"],
    tables: TABLES.map((t) => ({
      name: t.name,
      kind: t.kind,
      grain: t.grain,
      json: `/api/v1/${t.name}`,
      csv: `/api/v1/${t.name}?format=csv`,
    })),
  });
}
