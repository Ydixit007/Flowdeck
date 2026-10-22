import { z } from "zod";
import { handleError, parseQuery } from "@/lib/api";
import { toCsv, zip } from "@/lib/export-file";
import { requireSmolAdmin } from "@/server/smol";
import { smolExport } from "@/server/smol-export";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await requireSmolAdmin();
    const { format } = parseQuery(request, z.object({ format: z.enum(["json", "csv"]).default("json") }));
    const dump = await smolExport();
    const base = `${dump.database}-${dump.exportedAt.slice(0, 19).replaceAll(":", "-")}`;
    const [body, type, ext] =
      format === "json"
        ? [JSON.stringify(dump), "application/json", "json"]
        : [new Uint8Array(zip(Object.entries(dump.tables).map(([name, rows]) => ({ name: `${name}.csv`, data: toCsv(rows) })))), "application/zip", "zip"];
    return new Response(body, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}
