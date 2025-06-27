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

## License

MIT 