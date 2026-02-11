#!/bin/bash
# FlexiWork Rosta - Full System Backup
# Requires: PostgreSQL client (pg_dump), tar
# For Supabase: set DATABASE_URL in .env (from Supabase Dashboard > Settings > Database)

set -e
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${DATE}"
mkdir -p "${BACKUP_DIR}"

echo "=== FlexiWork Rosta System Backup ==="
echo "Backup directory: ${BACKUP_DIR}"

# Load .env if exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

# Backup database (requires DATABASE_URL)
if [ -n "${DATABASE_URL}" ]; then
  echo "Backing up database schema..."
  pg_dump "${DATABASE_URL}" --schema-only > "${BACKUP_DIR}/schema.sql" 2>/dev/null || echo "Schema backup skipped (pg_dump failed)"

  echo "Backing up database data..."
  pg_dump "${DATABASE_URL}" --data-only > "${BACKUP_DIR}/data.sql" 2>/dev/null || echo "Data backup skipped (pg_dump failed)"

  echo "Backing up full database..."
  pg_dump "${DATABASE_URL}" > "${BACKUP_DIR}/full_backup.sql" 2>/dev/null || echo "Full backup skipped (pg_dump failed)"
else
  echo "DATABASE_URL not set - skipping database backup"
  echo "Get connection string from Supabase Dashboard > Settings > Database"
fi

# Backup codebase
echo "Backing up codebase..."
tar -czf "${BACKUP_DIR}/codebase.tar.gz" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='backups' \
  --exclude='.git' \
  .

# Backup environment files
echo "Backing up environment..."
cp .env.local "${BACKUP_DIR}/env.local.backup" 2>/dev/null || true
cp .env "${BACKUP_DIR}/env.backup" 2>/dev/null || true

# Backup Supabase migrations
if [ -d supabase ]; then
  echo "Backing up Supabase migrations..."
  cp -r supabase/migrations "${BACKUP_DIR}/supabase_migrations" 2>/dev/null || true
fi

# Create backup manifest
cat > "${BACKUP_DIR}/MANIFEST.txt" << EOF
Backup created: ${DATE}
System: FlexiWork Rosta
Components:
- Database schema
- Database data
- Full database dump
- Codebase (excluding node_modules)
- Environment files
- Supabase migrations

Restore instructions:
1. Database: psql \$DATABASE_URL < full_backup.sql
2. Codebase: tar -xzf codebase.tar.gz
3. Environment: Copy env files back
EOF

echo ""
echo "Backup complete: ${BACKUP_DIR}"
ls -lah "${BACKUP_DIR}"
