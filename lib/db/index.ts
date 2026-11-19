import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";

/* eslint-disable @typescript-eslint/no-explicit-any */

let db: any = null;

export function getDb(): any {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (url) {
    db = drizzleNeon(neon(url));
  } else if (process.env.NODE_ENV === "production") {
    // Serverless without a database: keep it in memory so the demo still works.
    db = drizzlePglite(new PGlite());
  } else {
    db = drizzlePglite(new PGlite(".pglite"));
  }
  return db;
}

export function usingPglite(): boolean {
  return !process.env.DATABASE_URL;
}

export async function rows<T = any>(query: any): Promise<T[]> {
  const res: any = await getDb().execute(query);
  if (!res) return [];
  if (Array.isArray(res)) return res as T[];
  return (res.rows ?? res) as T[];
}

export async function run(query: any): Promise<void> {
  await getDb().execute(query);
}
