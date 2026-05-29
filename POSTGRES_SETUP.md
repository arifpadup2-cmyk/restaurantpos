# Local PostgreSQL Setup for Restaurant POS

The POS system uses PostgreSQL for data storage. This guide walks you through setting up PostgreSQL on your local machine and configuring the POS to connect to it.

## Prerequisites

- Windows 10+ or Mac/Linux
- Administrative access to install PostgreSQL
- ~200 MB disk space

## Installation Steps

### 1. Install PostgreSQL

#### Windows
1. Download PostgreSQL 16 from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Run the installer
3. Accept the default options (port 5432, service: postgres)
4. **Set a strong password for the postgres superuser** — you'll need this
5. Finish the installation

#### Mac
```bash
brew install postgresql@16
brew services start postgresql@16
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 2. Run the Setup Script

This script creates the POS database and user automatically.

#### Windows (PowerShell)
```powershell
psql -U postgres -f scripts/setup-local-pg.sql
```

#### Mac/Linux (Bash)
```bash
psql -U postgres -f scripts/setup-local-pg.sql
```

You'll be prompted for the postgres superuser password you set during installation.

### 3. Verify the Setup

```bash
psql -h 127.0.0.1 -U pos_central_user -d restaurant_pos_central -c "SELECT 1"
```

If you see `1`, the database is ready.

### 4. Configure the POS

#### Option A: Using Environment Variables (Recommended for Development)

Copy the `.env.example` file to `.env`:

```bash
cp pos/.env.example pos/.env
```

Edit `pos/.env` and update any values if needed (defaults should work for local setup):
- `DB_HOST=127.0.0.1` (localhost)
- `DB_PORT=5432` (default PostgreSQL port)
- `DB_NAME=restaurant_pos_central`
- `DB_USER=pos_central_user`
- `DB_PASS=pos_secure_2024!` (as set by the setup script)

#### Option B: Using the POS Setup Screen

1. Launch the POS app
2. You'll see a "Setup" or "Database Configuration" screen
3. Enter the following:
   - **Host:** `127.0.0.1`
   - **Port:** `5432`
   - **Database:** `restaurant_pos_central`
   - **Username:** `pos_central_user`
   - **Password:** `pos_secure_2024!`
4. Click "Test Connection" to verify
5. Click "Save & Connect"

### 5. Launch POS

```bash
cd pos
npm install  # (if not already done)
npm start
```

The POS will automatically:
1. Connect to PostgreSQL
2. Run all pending database migrations (creating tables if needed)
3. Initialize default settings
4. Display the login screen

## Security Notes

### For Production Use
- **Change the default password** in the setup script before running it
- Use a strong, unique password (12+ characters, mix of uppercase/lowercase/numbers/symbols)
- Restrict PostgreSQL network access via `pg_hba.conf`
- Enable SSL/TLS for network connections
- Regular database backups

### For Local Development
- The defaults are acceptable for a single-developer local setup
- Keep PostgreSQL running in the background
- Stop the service when not in use to save system resources

## Backup and Restore

### Backup
```bash
pg_dump -h 127.0.0.1 -U pos_central_user -d restaurant_pos_central > backup.sql
```

### Restore
```bash
psql -h 127.0.0.1 -U pos_central_user -d restaurant_pos_central < backup.sql
```

## Troubleshooting

### "Connection refused" or "Cannot connect to database"

1. Verify PostgreSQL is running:
   - **Windows:** Check Services (search "Services" → look for "postgresql-x64-16")
   - **Mac:** `brew services list`
   - **Linux:** `sudo systemctl status postgresql`

2. Verify the database exists:
   ```bash
   psql -h 127.0.0.1 -U pos_central_user -l
   ```

3. Check if the user exists:
   ```bash
   psql -U postgres -c "\du"
   ```

### "Authentication failed"

- Verify the password in your config matches what was set in the setup script
- On Windows, you may need to clear cached credentials (Windows → Credential Manager)

### "Database does not exist"

Run the setup script again:
```bash
psql -U postgres -f scripts/setup-local-pg.sql
```

### Port 5432 is already in use

1. Find what's using the port (Windows): `netstat -ano | findstr 5432`
2. Either stop that service or configure PostgreSQL to use a different port
3. Update your POS config if you changed the port

## Advanced: Changing the Database Password

If you want to change the pos_central_user password after setup:

```bash
psql -U postgres -c "ALTER USER pos_central_user WITH PASSWORD 'new_password';"
```

Then update your POS `.env` or setup screen with the new password.

## Getting Help

- PostgreSQL Docs: https://www.postgresql.org/docs/
- POS Issues: Check the project repository
- Check PostgreSQL logs:
  - **Windows:** `C:\Program Files\PostgreSQL\16\data\log\`
  - **Mac:** `/usr/local/var/postgres/`
  - **Linux:** `/var/lib/postgresql/16/main/`
