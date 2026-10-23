import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client.js'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migraciones aplicadas')
await sql.end()
