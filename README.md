# TSQL

A TypeScript SQL library for PostgreSQL.

## Development Setup

### Prerequisites

- Node.js 18+
- Docker and Docker Compose

### Installation

```bash
npm install
```

### Environment Configuration

Copy the example environment file and configure your database settings:

```bash
cp .env.example .env
```

Edit `.env` with your database configuration:

```env
# Standard PostgreSQL environment variables
PGHOST=localhost
PGPORT=15432
PGDATABASE=tsql_dev
PGUSER=postgres
PGPASSWORD=postgres

# Alternative: use DATABASE_URL
# DATABASE_URL=postgresql://postgres:postgres@localhost:15432/tsql_dev
```

### Database Setup

Start the PostgreSQL database:

```bash
docker-compose up -d
```

The database will be available at `localhost:15432` with:
- Database: `tsql_dev`
- User: `postgres`
- Password: `postgres`

### Development

```bash
# Build the library
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run typecheck
```

### TypeScript Type Generation

Generate TypeScript interfaces and query builders from your database schema:

```bash
# Generate types for all tables
npx tsql-generate

# Generate types for all tables in a specific directory
npx tsql-generate ./my-types

# Generate types for specific tables only
npx tsql-generate ./generated users posts comments

# Via npm scripts (alternative)
npm run generate
npm run generate:types
```

This will create TypeScript files with:
- Interface definitions for each table
- Typed query builder classes
- Factory functions for creating queries

### Usage

```typescript
import { Database, getDatabaseConfig } from 'tsql'

// Option 1: Use environment variables (reads from .env automatically)
const db = new Database()

// Option 2: Use explicit configuration
const db2 = new Database({
  host: 'localhost',
  port: 15432,
  database: 'tsql_dev',
  user: 'postgres',
  password: 'postgres'
})

// Option 3: Get config object from environment
const config = getDatabaseConfig()
const db3 = new Database(config)

// Execute query
const result = await db.query('SELECT * FROM users')
console.log(result.rows)

// Parameterized query
const user = await db.query('SELECT * FROM users WHERE id = $1', [1])

// Close connection
await db.close()
```

#### Using Generated Types

After generating types, you can use them for type-safe database queries:

```typescript
import { Database } from 'tsql'
import { userQuery, User } from './generated'

const db = new Database()

// Type-safe queries with auto-completion
const users = await userQuery(db)
  .where(q => q.isActive.equals(true))
  .and(q => q.createdAt.greaterThan(new Date('2024-01-01')))
  .select()

// users is typed as User[]
console.log(users[0].firstName) // Type-safe property access
```

## License

MIT 