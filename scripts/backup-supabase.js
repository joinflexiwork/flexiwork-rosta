#!/usr/bin/env node
/**
 * FlexiWork Rosta - Supabase Backup Script
 *
 * Backs up:
 * 1. Supabase migrations (schema source of truth)
 * 2. Environment configuration
 * 3. (Optional) Database dump via pg_dump if DATABASE_URL is set
 *
 * Usage:
 *   node scripts/backup-supabase.js
 *   npm run backup:supabase  (add to package.json)
 *
 * Environment:
 *   DATABASE_URL - Supabase connection string (from Dashboard > Settings > Database)
 *   Or: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (for metadata only)
 */

const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups', `supabase_${TIMESTAMP}`)

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  ensureDir(dest)
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item)
    const destPath = path.join(dest, item)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function main() {
  console.log('=== FlexiWork Rosta - Supabase Backup ===\n')

  ensureDir(BACKUP_DIR)

  // 1. Backup Supabase migrations
  const migrationsDir = path.join(PROJECT_ROOT, 'supabase', 'migrations')
  if (fs.existsSync(migrationsDir)) {
    console.log('Backing up Supabase migrations...')
    copyDir(migrationsDir, path.join(BACKUP_DIR, 'migrations'))
    console.log('  Done.\n')
  } else {
    console.log('No supabase/migrations directory found.\n')
  }

  // 2. Backup environment files
  const envFiles = ['.env', '.env.local', '.env.production']
  for (const envFile of envFiles) {
    const src = path.join(PROJECT_ROOT, envFile)
    if (fs.existsSync(src)) {
      const dest = path.join(BACKUP_DIR, `${envFile}.backup`)
      fs.copyFileSync(src, dest)
      console.log(`Backed up ${envFile}`)
    }
  }
  console.log('')

  // 3. Load .env for DATABASE_URL
  let databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl && fs.existsSync(path.join(PROJECT_ROOT, '.env'))) {
    const envContent = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf8')
    const match = envContent.match(/DATABASE_URL=(.+)/)
    if (match) databaseUrl = match[1].trim().replace(/^["']|["']$/g, '')
  }
  if (!databaseUrl && fs.existsSync(path.join(PROJECT_ROOT, '.env.local'))) {
    const envContent = fs.readFileSync(path.join(PROJECT_ROOT, '.env.local'), 'utf8')
    const match = envContent.match(/DATABASE_URL=(.+)/)
    if (match) databaseUrl = match[1].trim().replace(/^["']|["']$/g, '')
  }

  // 4. Optional: pg_dump if DATABASE_URL is set
  if (databaseUrl) {
    console.log('Attempting database dump (pg_dump)...')
    try {
      const schemaPath = path.join(BACKUP_DIR, 'schema.sql')
      const fullPath = path.join(BACKUP_DIR, 'full_backup.sql')
      execSync(`pg_dump "${databaseUrl}" --schema-only --no-owner > "${schemaPath}"`, {
        stdio: 'pipe',
        maxBuffer: 50 * 1024 * 1024,
      })
      console.log('  Schema saved to schema.sql')

      execSync(`pg_dump "${databaseUrl}" --no-owner > "${fullPath}"`, {
        stdio: 'pipe',
        maxBuffer: 100 * 1024 * 1024,
      })
      console.log('  Full backup saved to full_backup.sql\n')
    } catch (e) {
      console.log('  pg_dump failed (install PostgreSQL client or check DATABASE_URL). Skipping.\n')
    }
  } else {
    console.log('DATABASE_URL not set. Get it from Supabase Dashboard > Settings > Database.\n')
  }

  // 5. Create manifest
  const manifest = `Supabase Backup: ${TIMESTAMP}
System: FlexiWork Rosta

Contents:
- migrations/  (Supabase schema migrations)
- .env*.backup (Environment files - redact before sharing!)
- schema.sql   (Full schema dump, if pg_dump available)
- full_backup.sql (Full database dump, if pg_dump available)

Restore:
1. Apply migrations: supabase db push (or run migrations manually)
2. Or restore: psql $DATABASE_URL < full_backup.sql
`
  fs.writeFileSync(path.join(BACKUP_DIR, 'MANIFEST.txt'), manifest)

  console.log(`Backup complete: ${BACKUP_DIR}`)
  console.log(fs.readdirSync(BACKUP_DIR).join(', '))
}

main()
