#!/usr/bin/env tsx

import { readFileSync } from 'fs'
import { join } from 'path'
import { Database } from '../src/database'

async function initDatabase() {
  console.log('🔄 Initializing database with init.sql...')
  
  try {
    // Read the init.sql file
    const sqlPath = join(__dirname, '..', 'init.sql')
    const sqlContent = readFileSync(sqlPath, 'utf8')
    
    // Create database connection
    // Override default config to use docker-compose settings
    const db = new Database({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '15432', 10), // Use docker-compose port
      database: process.env.PGDATABASE || 'dbuddy_dev',   // Use docker-compose database
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres'
    })
    
    // Execute the SQL
    await db.query(sqlContent)
    
    console.log('✅ Database initialized successfully!')
    console.log('📊 Created tables: users, comments')
    console.log('📋 Inserted sample data')
    
    // Close the connection
    await db.close()
    
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    process.exit(1)
  }
}

// Run the script
initDatabase() 