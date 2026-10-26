import type { NextRequest } from "next/server";
import { DAX_MEASURES, RLS_ROLES, powerQuery } from "@/lib/powerbi";

const FILES = ["measures.dax", "queries.pq", "rls-roles.dax"] as const;

export function generateStaticParams() {
  return FILES.map((file) => ({ file }));
}

export async function GET(req: NextRequest, ctx: RouteContext<"/powerbi/[file]">) {
  const { file } = await ctx.params;
  const body =
    file === "measures.dax"
      ? DAX_MEASURES
      : file === "rls-roles.dax"
        ? RLS_ROLES
        : file === "queries.pq"
          ? powerQuery(req.nextUrl.origin)
          : null;
  if (body === null) return Response.json({ error: "Not found", files: FILES }, { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
