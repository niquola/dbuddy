export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface QueryResult<T = unknown> {
  rows: T[]
  rowCount: number
}

// Generic query builder types
export interface WhereCondition {
  field: string
  operator: string
  value: unknown
}

export interface QueryState {
  table: string
  conditions: WhereCondition[]
  orderBy?: {
    field: string
    direction: 'ASC' | 'DESC'
  }
  limit?: number
  offset?: number
}



export interface BaseQueryBuilder<T, TBuilder> {
  orderBy(field: keyof T, direction?: 'ASC' | 'DESC'): TBuilder
  limit(count: number): TBuilder
  offset(count: number): TBuilder
  build(): { sql: string; params: unknown[] }
  execute(): Promise<QueryResult<T>>
}

// Specialized field query types for PostgreSQL
export interface TextFieldQuery<TBuilder> {
  // Standard comparison operators
  eq(value: string): TBuilder
  ne(value: string): TBuilder
  in(values: string[]): TBuilder
  gt(value: string): TBuilder
  gte(value: string): TBuilder
  lt(value: string): TBuilder
  lte(value: string): TBuilder
  
  // Text-specific operators
  like(pattern: string): TBuilder
  ilike(pattern: string): TBuilder // Case-insensitive LIKE
  notLike(pattern: string): TBuilder
  notIlike(pattern: string): TBuilder
  similarTo(pattern: string): TBuilder // SQL SIMILAR TO
  notSimilarTo(pattern: string): TBuilder
  regex(pattern: string): TBuilder // ~ operator
  iregex(pattern: string): TBuilder // ~* operator (case-insensitive)
  notRegex(pattern: string): TBuilder // !~ operator
  notIregex(pattern: string): TBuilder // !~* operator
  
  // Convenience methods
  startsWith(prefix: string): TBuilder
  endsWith(suffix: string): TBuilder
  contains(substring: string): TBuilder
  icontains(substring: string): TBuilder // Case-insensitive contains
  isEmpty(): TBuilder
  isNotEmpty(): TBuilder
  
  // Null checks
  isNull(): TBuilder
  isNotNull(): TBuilder
}

export interface TimestampFieldQuery<TBuilder> {
  // Standard comparison operators
  eq(value: Date | string): TBuilder
  ne(value: Date | string): TBuilder
  in(values: (Date | string)[]): TBuilder
  gt(value: Date | string): TBuilder
  gte(value: Date | string): TBuilder
  lt(value: Date | string): TBuilder
  lte(value: Date | string): TBuilder
  
  // Timestamp-specific operators
  between(start: Date | string, end: Date | string): TBuilder
  notBetween(start: Date | string, end: Date | string): TBuilder
  
  // Date truncation functions
  dateTruncEq(unit: DateTruncUnit, value: Date | string): TBuilder
  dateTruncGt(unit: DateTruncUnit, value: Date | string): TBuilder
  dateTruncGte(unit: DateTruncUnit, value: Date | string): TBuilder
  dateTruncLt(unit: DateTruncUnit, value: Date | string): TBuilder
  dateTruncLte(unit: DateTruncUnit, value: Date | string): TBuilder
  
  // Extract functions
  extractEq(part: DatePart, value: number): TBuilder
  extractGt(part: DatePart, value: number): TBuilder
  extractGte(part: DatePart, value: number): TBuilder
  extractLt(part: DatePart, value: number): TBuilder
  extractLte(part: DatePart, value: number): TBuilder
  extractIn(part: DatePart, values: number[]): TBuilder
  
  // Convenience methods for common date operations
  isToday(): TBuilder
  isYesterday(): TBuilder
  isTomorrow(): TBuilder
  isThisWeek(): TBuilder
  isThisMonth(): TBuilder
  isThisYear(): TBuilder
  isAfterDays(days: number): TBuilder // After N days from now
  isBeforeDays(days: number): TBuilder // Before N days from now
  
  // Timezone operations
  atTimeZone(timezone: string, operator: '=' | '>' | '>=' | '<' | '<=', value: Date | string): TBuilder
  
  // Null checks
  isNull(): TBuilder
  isNotNull(): TBuilder
}

export type DateTruncUnit = 
  | 'year' | 'quarter' | 'month' | 'week' | 'day' 
  | 'hour' | 'minute' | 'second' | 'millisecond'

export type DatePart = 
  | 'year' | 'quarter' | 'month' | 'week' | 'day' | 'dayofweek' | 'dayofyear'
  | 'hour' | 'minute' | 'second' | 'millisecond' | 'timezone'

export interface NumberFieldQuery<TBuilder> {
  // Standard comparison operators
  eq(value: number): TBuilder
  ne(value: number): TBuilder
  in(values: number[]): TBuilder
  gt(value: number): TBuilder
  gte(value: number): TBuilder
  lt(value: number): TBuilder
  lte(value: number): TBuilder
  
  // Range operators
  between(min: number, max: number): TBuilder
  notBetween(min: number, max: number): TBuilder
  
  // Null checks
  isNull(): TBuilder
  isNotNull(): TBuilder
}

export interface BooleanFieldQuery<TBuilder> {
  // Boolean-specific operators
  eq(value: boolean): TBuilder
  ne(value: boolean): TBuilder
  isTrue(): TBuilder
  isFalse(): TBuilder
  
  // Null checks
  isNull(): TBuilder
  isNotNull(): TBuilder
}

export interface JsonFieldQuery<TBuilder> {
  // JSON-specific operators
  eq(value: unknown): TBuilder
  ne(value: unknown): TBuilder
  
  // JSON path operations
  pathExists(path: string): TBuilder
  pathNotExists(path: string): TBuilder
  pathEq(path: string, value: unknown): TBuilder
  pathNe(path: string, value: unknown): TBuilder
  
  // JSON containment
  contains(value: unknown): TBuilder
  containedBy(value: unknown): TBuilder
  hasKey(key: string): TBuilder
  hasAnyKeys(keys: string[]): TBuilder
  hasAllKeys(keys: string[]): TBuilder
  
  // Null checks
  isNull(): TBuilder
  isNotNull(): TBuilder
}

export interface Migration {
  version: string
  name: string
  upSql: string
  downSql: string
  appliedAt?: Date
  checksum?: string
}

export interface MigrationRecord {
  id: number
  version: string
  name: string
  applied_at: Date
  checksum: string
}

export interface MigrationStatus {
  version: string
  name: string
  status: 'pending' | 'applied'
  appliedAt?: Date
}

export interface MigrationOptions {
  migrationsDir?: string
  target?: string
  dryRun?: boolean
} 