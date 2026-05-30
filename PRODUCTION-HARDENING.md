# Production Hardening Checklist — Restaurant POS

Security steps to apply **at deployment time** for each restaurant. On dev machines
these are intentionally left relaxed (shared `123456`, PostgreSQL reachable locally)
for convenience. Do **not** ship a production install without completing this list.

> Status of Phase 0 (see security plan): the application-level **SQL guard is already
> built in** (`pos/sql-guard.js`, enforced in `main.js` DB IPC handlers) and ships in
> every build — nothing to do per-deployment for that item. The two items below are
> infrastructure/config and must be done on the server PC at each site.

---

## 1. Rotate the database password off the default

The dev default is `123456` for both the `postgres` superuser and the `pos_central_user`
role. Every production site must use a unique strong password.

**On the server PC (where PostgreSQL runs):**

```sql
-- Connect as superuser, then:
ALTER USER pos_central_user WITH PASSWORD '<STRONG_UNIQUE_PASSWORD>';
-- Also rotate the postgres superuser itself:
ALTER USER postgres WITH PASSWORD '<DIFFERENT_STRONG_PASSWORD>';
```

**Then update the password in all three places so the apps still connect:**

| File / location | Field | Notes |
|---|---|---|
| `server/.env` | `DB_PASS=` | Server holds the DB credential. |
| `pos/.env` (dev only) | `DB_PASS=` | Dev source; excluded from the installer build. |
| Installed POS `pos-config.json` | `dbPass` | Per-terminal config in `%APPDATA%\restaurant-pos\`. |

> ⚠️ These three must match the role password exactly or you get
> `password authentication failed for user "pos_central_user"`.
> Generate the password with a password manager (16+ chars, no reuse across sites).

**After Phase 1 of the security plan lands** (POS routed through the API), terminals
will no longer hold a DB password at all — only the server `.env` will, which makes this
step a single-file change.

---

## 2. Restrict PostgreSQL network exposure

PostgreSQL must be reachable by POS/waiter terminals on the LAN, but **never** from the
public internet or untrusted networks.

**`postgresql.conf`** — bind only to the loopback + the server's LAN address, never `*`:

```conf
# Example: server LAN IP is 192.168.1.10
listen_addresses = 'localhost,192.168.1.10'
```

**`pg_hba.conf`** — allow only the POS LAN subnet with password (scram-sha-256) auth.
Remove any `0.0.0.0/0` or `trust` lines.

```conf
# TYPE  DATABASE                 USER              ADDRESS           METHOD
host    restaurant_pos_central   pos_central_user  127.0.0.1/32      scram-sha-256
host    restaurant_pos_central   pos_central_user  192.168.1.0/24    scram-sha-256
```

Then reload: `SELECT pg_reload_conf();` (or restart the `postgresql-x64-18` service).

**Firewall:** allow TCP 5432 only from the POS LAN subnet; block it at the router/WAN.

> ⚠️ **Lockout risk:** tightening `pg_hba.conf` can disconnect terminals mid-shift.
> Apply during a maintenance window and keep a `127.0.0.1` line so the server PC can
> always reconnect to recover.

> ℹ️ **Single-box installs** (POS + PostgreSQL on the same PC, no separate terminals):
> use `listen_addresses = 'localhost'` and only the `127.0.0.1/32` hba line — the LAN
> lines above are not needed.

---

## Quick verification after hardening

```powershell
# Confirm the app role connects with the new password:
$env:PGPASSWORD = '<STRONG_UNIQUE_PASSWORD>'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -U pos_central_user `
  -d restaurant_pos_central -c "SELECT current_user, current_database();"

# Confirm PostgreSQL is NOT listening on a public interface (only loopback/LAN):
Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object LocalAddress
```

Then launch the server (`npm start` in `server/`) and a POS terminal, and run one test
order end-to-end to confirm nothing was broken by the network/auth changes.
