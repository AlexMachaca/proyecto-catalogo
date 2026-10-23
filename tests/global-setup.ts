import { execFileSync } from 'node:child_process'
import postgres from 'postgres'
import { ENV_TEST } from '../vitest.config.js'

// Crea (si no existe) la base de pruebas, aplica migraciones y siembra datos base
export default async function setup() {
  const url = new URL(ENV_TEST.DATABASE_URL)
  const nombre = url.pathname.slice(1)
  const admin = new URL(url)
  admin.pathname = '/postgres'

  const sql = postgres(admin.toString(), { max: 1 })
  const [existe] = await sql`select 1 from pg_database where datname = ${nombre}`
  if (!existe) await sql.unsafe(`create database "${nombre}"`)
  await sql.end()

  const env = { ...process.env, ...ENV_TEST }
  for (const script of ['src/db/migrate.ts', 'src/db/seed/index.ts']) {
    execFileSync('npx', ['tsx', script], { env, stdio: 'pipe' })
  }
}
