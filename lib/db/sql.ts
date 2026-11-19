import { sql, type SQL } from "drizzle-orm";
import { run } from "./index";

/**
 * Builds one multi-row INSERT. Used by the seed so a full demo dataset is
 * written in ~10 round trips instead of ~300.
 */
export function insertMany(table: string, rowsIn: Record<string, unknown>[]): SQL | null {
  if (!rowsIn.length) return null;
  const cols = Object.keys(rowsIn[0]);
  const values = rowsIn.map(
    (row) => sql`(${sql.join(cols.map((c) => sql`${row[c] ?? null}`), sql`, `)})`,
  );
  return sql`insert into ${sql.raw(table)} (${sql.raw(cols.join(", "))}) values ${sql.join(values, sql`, `)}`;
}

export async function insertRows(table: string, rowsIn: Record<string, unknown>[]): Promise<void> {
  const q = insertMany(table, rowsIn);
  if (q) await run(q);
}

let counter = 0;
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
