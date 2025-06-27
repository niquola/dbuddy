# Database Schema Generator

This generator reads your PostgreSQL database tables from the `public` schema and automatically generates TypeScript interfaces and type-safe query builders.

## Features

- 🔍 **Automatic Discovery**: Scans all tables in the public schema
- 🛡️ **Type Safety**: Generates TypeScript interfaces with proper nullable types
- 🔧 **Query Builders**: Creates typed query builder functions for each table
- 📝 **PostgreSQL Support**: Comprehensive mapping of PostgreSQL types to TypeScript
- 🎯 **Public Schema Only**: Focuses on public schema tables for security

## Usage

### Command Line

Generate types to the default `./generated` directory:
```bash
npm run generate
```

Generate types to a specific directory:
```bash
npm run generate:types ./src/types
```

Or run directly with tsx:
```bash
npx tsx src/generator.ts ./custom-output-dir
```

### Programmatic Usage

```typescript
import { SchemaGenerator } from './src/generator'

const generator = new SchemaGenerator()
await generator.generate('./generated')
```

## Output Structure

For a table named `users`, the generator creates:

### Interface (`generated/users.ts`)
```typescript
export interface Users {
  id: number
  name: string
  email: string
  createdAt: Date
}

export function usersQuery(db: Database): QueryBuilder<Users> {
  return createQueryBuilder<Users>(db, 'users')
}
```

### Index File (`generated/index.ts`)
```typescript
export { Users, usersQuery } from './users'
// ... other exports
```

## Type Mappings

| PostgreSQL Type | TypeScript Type |
|----------------|-----------------|
| `bigint`, `integer`, `serial`, `numeric`, `real` | `number` |
| `boolean` | `boolean` |
| `date`, `timestamp`, `timestamptz` | `Date` |
| `json`, `jsonb` | `any` |
| `varchar`, `text`, `uuid`, `char` | `string` |
| Nullable columns | `Type \| null` |

## Example Usage

After generation, use your types like this:

```typescript
import { Database } from './src/database'
import { Users, usersQuery } from './generated'

const db = new Database()

// Type-safe queries
const users = await usersQuery(db)
  .textField('email').like('%@example.com')
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .execute()

// users.rows is now typed as Users[]
users.rows.forEach(user => {
  console.log(user.name) // TypeScript knows this is a string
  console.log(user.id)   // TypeScript knows this is a number
})
```

## Environment Setup

Make sure your database connection is configured via environment variables:

```bash
# .env
PGHOST=localhost
PGPORT=5432
PGDATABASE=your_database
PGUSER=your_username
PGPASSWORD=your_password
```

## Naming Conventions

- **Tables**: `user_profiles` → **Interface**: `UserProfiles`
- **Columns**: `created_at` → **Property**: `createdAt`
- **Query Functions**: `user_profiles` → **Function**: `userProfilesQuery`

## Requirements

- PostgreSQL database
- Tables in the `public` schema
- Node.js with TypeScript support
- Proper database connection configuration

## Regeneration

Run the generator whenever your database schema changes to keep your types in sync. The generator will overwrite existing files, so avoid manual modifications to generated files.

## Error Handling

The generator includes comprehensive error handling and will:
- Report connection issues
- Skip empty schemas gracefully  
- Provide detailed progress logging
- Clean up database connections properly

## Advanced Configuration

You can also pass custom database configuration:

```typescript
import { SchemaGenerator } from './src/generator'

const generator = new SchemaGenerator({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'myuser',
  password: 'mypass'
})

await generator.generate('./types')
``` 