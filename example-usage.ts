import { Database } from './src/database'
import { usersQuery, commentsQuery } from './generated'

async function main() {
  const db = new Database()

  try {
    console.log('🚀 Testing enhanced query builder with column-specific field accessors...\n')

    // Example 1: Simple text field queries
    console.log('📝 Example 1: Text field queries')
    const { sql: sql1, params: params1 } = usersQuery(db)
      .name.eq('John Doe')
      .email.contains('@example.com')
      .build()
    
    console.log('Query:', sql1)
    console.log('Params:', params1)
    console.log()

    // Example 2: Number field queries
    console.log('🔢 Example 2: Number field queries')
    const { sql: sql2, params: params2 } = usersQuery(db)
      .id.gte(10)
      .id.lte(100)
      .build()
    
    console.log('Query:', sql2)
    console.log('Params:', params2)
    console.log()

    // Example 3: Timestamp field queries
    console.log('📅 Example 3: Timestamp field queries')
    const { sql: sql3, params: params3 } = commentsQuery(db)
      .createdAt.isThisMonth()
      .updatedAt.gt(new Date('2024-01-01'))
      .build()
    
    console.log('Query:', sql3)
    console.log('Params:', params3)
    console.log()

    // Example 4: Complex queries with multiple field types
    console.log('🔄 Example 4: Complex multi-field query')
    const { sql: sql4, params: params4 } = commentsQuery(db)
      .author.startsWith('admin')
      .content.icontains('important')
      .id.between(1, 1000)
      .createdAt.isAfterDays(7)
      .orderBy('createdAt', 'DESC')
      .limit(10)
      .build()
    
    console.log('Query:', sql4)
    console.log('Params:', params4)
    console.log()

    // Example 5: Actual query execution
    console.log('🎯 Example 5: Executing a real query')
    const result = await usersQuery(db)
      .name.isNotNull()
      .email.isNotNull()
      .limit(5)
      .execute()
    
    console.log('Results:')
    console.log('Row count:', result.rowCount)
    console.log('Data:', result.rows)
    console.log()

    console.log('✅ All examples completed successfully!')

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await db.close()
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error)
} 