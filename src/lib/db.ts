import { randomUUID } from "node:crypto";
import pg, { type Pool, type PoolClient } from "pg";

const { types } = pg;
const toIso = (value: string) =>
  new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
types.setTypeParser(types.builtins.TIMESTAMPTZ, toIso);
types.setTypeParser(types.builtins.TIMESTAMP, (v) => toIso(`${v}+00`));
types.setTypeParser(types.builtins.DATE, (v) => v);
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.NUMERIC, Number);

function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return raw;
  }
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForDb.pgPool ??
  new pg.Pool({
    connectionString: connectionString(),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    options: "-c timezone=UTC",
  });

globalForDb.pgPool = pool;

export type Conn = PoolClient;
type Runner = Pool | PoolClient;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

function compile(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let text = "";
  let index = 0;
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      text += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      text += ch;
      continue;
    }
    if (ch !== "?") {
      text += ch;
      continue;
    }
    const value = params[index++];
    if (isPlainObject(value)) {
      text += Object.entries(value)
        .map(([k, v]) => {
          values.push(v === undefined ? null : v);
          return `${ident(k)} = $${values.length}`;
        })
        .join(", ");
    } else {
      values.push(value === undefined ? null : value);
      text += `$${values.length}`;
    }
  }
  return { text, values };
}

async function run(sql: string, params: unknown[], on: Runner) {
  const { text, values } = compile(sql, params);
  return on.query(text, values);
}

/** All rows of a query. Values go in `params` (as ?), never into the SQL string. */
export async function rows<T>(sql: string, params: unknown[] = [], on: Runner = pool): Promise<T[]> {
  const result = await run(sql, params, on);
  return result.rows as T[];
}

/** The first row of a query, or null. */
export async function row<T>(sql: string, params: unknown[] = [], on: Runner = pool): Promise<T | null> {
  const list = await rows<T>(sql, params, on);
  return list[0] ?? null;
}

/** Run an INSERT / UPDATE / DELETE; returns how many rows it touched. */
export async function exec(sql: string, params: unknown[] = [], on: Runner = pool): Promise<number> {
  const result = await run(sql, params, on);
  return result.rowCount ?? 0;
}

/** A new row id. Made here (not by the database) so the code knows it straight away. */
export const newId = () => randomUUID();

function insertSql(table: string, list: Record<string, unknown>[], suffix = "") {
  const columns = Object.keys(list[0]);
  const values: unknown[] = [];
  const tuples = list.map(
    (v) =>
      `(${columns
        .map((c) => {
          values.push(v[c] === undefined ? null : v[c]);
          return `$${values.length}`;
        })
        .join(", ")})`,
  );
  return {
    text: `INSERT INTO ${ident(table)} (${columns.map(ident).join(", ")}) VALUES ${tuples.join(", ")}${suffix}`,
    values,
  };
}

/** Insert one row from an object; returns its id. */
export async function insert(
  table: string,
  values: Record<string, unknown>,
  on: Runner = pool,
): Promise<string> {
  const id = (values.id as string | undefined) ?? newId();
  const { text, values: params } = insertSql(table, [{ ...values, id }]);
  await on.query(text, params);
  return id;
}

export async function insertIgnore(
  table: string,
  values: Record<string, unknown>,
  on: Runner = pool,
): Promise<boolean> {
  const id = (values.id as string | undefined) ?? newId();
  const { text, values: params } = insertSql(table, [{ ...values, id }], " ON CONFLICT DO NOTHING");
  const result = await on.query(text, params);
  return (result.rowCount ?? 0) > 0;
}

/** Insert many rows of the same shape. */
export async function insertMany(
  table: string,
  list: Record<string, unknown>[],
  on: Runner = pool,
): Promise<void> {
  if (list.length === 0) return;
  const withIds = list.map((v) => ({ id: newId(), ...v }));
  const { text, values } = insertSql(table, withIds);
  await on.query(text, values);
}

/** Update a row by id from an object. Nothing to change = nothing done. */
export async function updateById(
  table: string,
  id: string,
  values: Record<string, unknown>,
  on: Runner = pool,
): Promise<void> {
  if (Object.keys(values).length === 0) return;
  await exec(`UPDATE ${ident(table)} SET ? WHERE id = ?`, [values, id], on);
}

/** Run several statements as one: all of them happen, or none do. */
export async function transaction<T>(work: (conn: Conn) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const result = await work(conn);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

export async function setImporting(conn: Conn, on: boolean): Promise<void> {
  await conn.query("SELECT set_config('app.importing', $1, true)", [on ? "1" : "0"]);
}

/** A unique key already has this value (e.g. a ticket number in use). */
export function isDuplicate(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

/** A readable message from a database error. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** "?, ?, ?" for an IN (...) list. */
export const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
