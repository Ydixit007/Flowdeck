import { z } from "zod";
import { handleError, parseQuery } from "@/lib/api";
import { csvChunks, jsonChunks, toStream, zip } from "@/lib/export-file";
import { requireSmolAdmin } from "@/server/smol";
import { smolExport } from "@/server/smol-export";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await requireSmolAdmin();
    const { format } = parseQuery(request, z.object({ format: z.enum(["json", "csv"]).default("json") }));
    const { database, exportedAt, tables } = await smolExport();
    const base = `${database}-${exportedAt.slice(0, 19).replaceAll(":", "-")}`;
    // Streamed: Vercel caps buffered responses at 4.5 MB and the dump runs to hundreds of MB.
    if (format === "json") {
      const body = toStream(jsonChunks({ database, exportedAt }, tables)).pipeThrough(new CompressionStream("gzip"));
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Content-Disposition": `attachment; filename="${base}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const files = (async function* () {
      for await (const table of tables) yield { name: `${table.name}.csv`, chunks: csvChunks(table) };
    })();
    return new Response(toStream(zip(files)), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}.zip"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}
