# Migration System

The DBuddy library includes a robust migration system for managing database schema changes. This system allows you to version control your database schema and apply changes in a controlled, reproducible manner.

## Quick Start

### 1. Initialize Migration System

```bash
npx dbuddy migration init
```

This creates the `dbuddy_migrations` table in your database to track applied migrations.

### 2. Create a Migration

```bash
npx dbuddy migration create add_users_table
```

This generates two files:
- `migrations/YYYYMMDDHHMMSS_add_users_table.up.sql` - Forward migration
- `migrations/YYYYMMDDHHMMSS_add_users_table.down.sql` - Rollback migration

### 3. Edit Migration Files

Edit the generated `.up.sql` and `.down.sql` files:

**20250628120000_add_users_table.up.sql:**
```sql
-- Migration: add_users_table
-- Created: 2025-06-28T12:00:00.000Z
-- Up migration

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**20250628120000_add_users_table.down.sql:**
```sql
-- Migration: add_users_table  
-- Created: 2025-06-28T12:00:00.000Z
-- Down migration (rollback)

DROP TABLE IF EXISTS users;
```

### 4. Apply Migrations

```bash
# Apply all pending migrations
npx dbuddy migration up

# Apply migrations up to a specific version
npx dbuddy migration up --target 20250628120000

# Dry run (preview what would be applied)
npx dbuddy migration up --dry-run
```

### 5. Check Migration Status

```bash
npx dbuddy migration status
```

### 6. Rollback Migrations

```bash
# Rollback the most recent migration
npx dbuddy migration down

# Rollback to a specific version
npx dbuddy migration down --target 20250628120000

# Dry run rollback
npx dbuddy migration down --dry-run
```

## CLI Commands

### `migration init`
Initializes the migration system by creating the `dbuddy_migrations` table.

```bash
npx dbuddy migration init
```

### `migration create <name>`
Creates a new migration with the specified name.

```bash
npx dbuddy migration create add_posts_table
```

**Options:**
- `--migrations-dir <dir>` - Specify migrations directory (default: `./migrations`)

### `migration up [target]`
Applies pending migrations.

```bash
# Apply all pending migrations
npx dbuddy migration up

# Apply up to specific version
npx dbuddy migration up --target 20250628120000

# Dry run
npx dbuddy migration up --dry-run
```

**Options:**
- `--target <version>` - Target migration version
- `--dry-run` - Show what would be done without executing
- `--migrations-dir <dir>` - Specify migrations directory

### `migration down [target]`
Rolls back applied migrations.

```bash
# Rollback most recent migration
npx dbuddy migration down

# Rollback to specific version  
npx dbuddy migration down --target 20250628120000

# Dry run
npx dbuddy migration down --dry-run
```

**Options:**
- `--target <version>` - Target migration version (rollback to this version)
- `--dry-run` - Show what would be done without executing
- `--migrations-dir <dir>` - Specify migrations directory

### `migration status`
Shows the status of all migrations.

```bash
npx dbuddy migration status
```

**Options:**
- `--migrations-dir <dir>` - Specify migrations directory

## Migration File Format

Migration files must follow this naming convention:
```
YYYYMMDDHHMMSS_migration_name.up.sql
YYYYMMDDHHMMSS_migration_name.down.sql
```

Where:
- `YYYYMMDDHHMMSS` is a timestamp (e.g., `20250628120000`)
- `migration_name` is a descriptive name using underscores
- `.up.sql` contains the forward migration SQL
- `.down.sql` contains the rollback migration SQL

## Features

### Atomic Transactions
Each migration runs in a transaction. If any part of a migration fails, the entire migration is rolled back and not recorded as applied.

### Checksums
Migration content is checksummed to detect modifications to applied migrations.

### Ordering
Migrations are applied in chronological order based on their timestamp prefixes.

### Dry Run Mode
Preview what migrations would be applied or rolled back without actually executing them.

### Target Versions
Apply or rollback migrations to a specific version.

### Status Tracking
View which migrations have been applied and when.

## Best Practices

### 1. Always Create Rollback Scripts
Every `.up.sql` migration should have a corresponding `.down.sql` that reverses the changes.

### 2. Make Migrations Idempotent
Use `IF NOT EXISTS`, `IF EXISTS`, etc. to make migrations safe to run multiple times.

```sql
-- Good
CREATE TABLE IF NOT EXISTS users (...);

-- Good  
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Good
DROP TABLE IF EXISTS old_table;
```

### 3. Don't Modify Applied Migrations
Once a migration has been applied to production, don't modify it. Create a new migration instead.

### 4. Test Rollbacks
Always test that your `.down.sql` scripts work correctly.

### 5. Keep Migrations Small
Break large schema changes into smaller, focused migrations.

### 6. Use Descriptive Names
Use clear, descriptive names for your migrations:

```bash
# Good
npx dbuddy migration create add_user_email_index
npx dbuddy migration create remove_deprecated_status_column

# Bad  
npx dbuddy migration create fix_stuff
npx dbuddy migration create update_schema
```

## Programmatic Usage

You can also use the migration system programmatically:

```typescript
import { Database, MigrationRunner } from 'dbuddy'

const db = new Database()
const runner = new MigrationRunner(db, './migrations')

// Initialize migration system
await runner.initialize()

// Generate migration
await runner.generateMigration('add_users_table')

// Apply migrations
await runner.migrateUp()

// Check status
const status = await runner.getStatus()
console.log(status)

// Rollback
await runner.migrateDown({ target: '20250628120000' })

// Clean up
await db.close()
```

## Migration Table Schema

The migration system creates a `dbuddy_migrations` table to track applied migrations:

```sql
CREATE TABLE dbuddy_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(255) NOT NULL
);
```

## Configuration

### Environment Variables

The migration system uses the same database configuration as the main library:

```bash
# PostgreSQL connection
PGHOST=localhost
PGPORT=5432
PGDATABASE=myapp
PGUSER=postgres
PGPASSWORD=password

# Or use a connection string
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
```

### Custom Migrations Directory

By default, migrations are stored in `./migrations`. You can customize this:

```bash
npx dbuddy migration create add_users --migrations-dir ./db/migrations
```

## Troubleshooting

### Migration Fails

If a migration fails:
1. Check the error message for SQL syntax issues
2. Ensure all referenced tables/columns exist
3. Check for foreign key constraints
4. Verify permissions

### Migration Applied But Not Showing in Status

This usually means the migration files were deleted or moved. The migration tracking is based on both the database records and the presence of migration files.

### Want to Skip a Migration

You can manually mark a migration as applied:

```sql
INSERT INTO dbuddy_migrations (version, name, checksum) 
VALUES ('20250628120000', 'migration_name', 'dummy_checksum');
```

### Reset Migration System

To completely reset (⚠️ **WARNING: This will lose all data**):

```sql
DROP TABLE IF EXISTS dbuddy_migrations CASCADE;
-- Drop all your application tables
```

Then re-run `migration init` and apply all migrations from scratch. 