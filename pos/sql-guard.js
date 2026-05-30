'use strict';

// ── Renderer SQL guard (Phase 0 hardening) ────────────────────────────────────
// Renderer-issued SQL runs via sql.unsafe(query, params). Params are bound
// separately, so param-level injection is already mitigated — but the query
// STRING itself is arbitrary. This guard ensures a buggy or compromised renderer
// cannot run DDL, admin statements, dangerous server-side functions, or chained
// statements. The app only ever issues parameterized SELECT/INSERT/UPDATE/DELETE
// (and the INSERT OR REPLACE/IGNORE shims, which still begin with INSERT).
// Migrations run in the main process via runMigrations(), never through IPC.

const ALLOWED_SQL_LEADING = /^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;
const BLOCKED_SQL_FUNCTIONS = /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|pg_sleep|pg_terminate_backend|pg_cancel_backend|set_config)\s*\(/i;

// Remove comments and single-quoted string literals so guard checks see only SQL
// structure (a literal like '...; drop' must not trip the multi-statement check).
function stripSqlNoise(q) {
  return q
    .replace(/--[^\n]*/g, ' ')          // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // block comments
    .replace(/'(?:[^']|'')*'/g, "''");  // single-quoted string literals
}

// Returns an error message string if the query is rejected, or null if allowed.
function validateRendererSql(query) {
  if (typeof query !== 'string' || !query.trim()) return 'empty or non-string query';
  const cleaned = stripSqlNoise(query).trim();

  // Reject chained statements: a ';' followed by anything other than trailing space.
  const semi = cleaned.indexOf(';');
  if (semi !== -1 && cleaned.slice(semi + 1).trim().length > 0) {
    return 'multiple statements are not allowed';
  }
  // Must begin with an allowed DML verb (blocks DROP/ALTER/CREATE/TRUNCATE/GRANT/
  // REVOKE/COPY/CALL/DO/SET/VACUUM... as a leading statement).
  if (!ALLOWED_SQL_LEADING.test(cleaned)) {
    return 'only SELECT/INSERT/UPDATE/DELETE/WITH statements are allowed';
  }
  // Block dangerous server-side functions even inside an allowed statement.
  if (BLOCKED_SQL_FUNCTIONS.test(cleaned)) {
    return 'statement contains a blocked function';
  }
  return null;
}

module.exports = { validateRendererSql, stripSqlNoise };
