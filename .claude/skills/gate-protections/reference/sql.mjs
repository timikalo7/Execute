/**
 * Protection for `system-design-gate: sql-interpolation` — SQL injection.
 *
 * `query(\`SELECT * FROM users WHERE id = ${id}\`)` with `id = "1 OR 1=1"` returns every
 * user. With `id = "1; DROP TABLE users--"` it does worse.
 *
 * Parameterised queries are not "escaping done well" — the values never touch the SQL
 * parser at all. The database receives a query with placeholders and a separate list of
 * values, so a value can never become syntax.
 */
export class SqlError extends Error {
  constructor(reason) { super(reason); this.name = "SqlError"; this.reason = reason; }
}

/**
 * A tagged template that produces { text, values } instead of a string, so the dangerous
 * thing is impossible rather than discouraged.
 *
 *   const q = sql`SELECT * FROM users WHERE id = ${id} AND org = ${orgId}`;
 *   await client.query(q.text, q.values);   //  SELECT ... WHERE id = $1 AND org = $2
 */
export function sql(strings, ...values) {
  let text = "";
  strings.forEach((part, i) => {
    text += part;
    if (i < values.length) text += `$${i + 1}`;
  });
  return { text, values };
}

/**
 * Identifiers (table and column names) CANNOT be parameterised — placeholders only work
 * for values. So an identifier that varies must come from an allow-list, never from a
 * request. This is the hole people fall into after correctly parameterising values.
 */
export function ident(name, allowed) {
  if (!Array.isArray(allowed) || !allowed.length) throw new SqlError("identifiers need an allow-list");
  if (!allowed.includes(name)) throw new SqlError(`identifier not allow-listed: ${name}`);
  return `"${name.replace(/"/g, '""')}"`;
}

/** Ordering is the other one: "ORDER BY " + req.query.sort is injectable. */
export function orderBy(column, direction, allowedColumns) {
  const col = ident(column, allowedColumns);
  const dir = String(direction).toLowerCase() === "desc" ? "DESC" : "ASC";
  return `ORDER BY ${col} ${dir}`;
}
