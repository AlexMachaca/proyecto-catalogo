import { sql as dsql } from 'drizzle-orm'
import { env } from '../../config/env.js'
import { hashPassword } from '../../lib/password.js'
import { slugify } from '../../lib/slug.js'
import { db, sql } from '../client.js'
import { categorias, departamentos, distritos, provincias, usuarios } from '../schema.js'
import { CATEGORIAS } from './categorias.js'
import { DEPARTAMENTO, PROVINCIAS } from './ubigeo.js'

await db
  .insert(departamentos)
  .values(DEPARTAMENTO)
  .onConflictDoUpdate({ target: departamentos.id, set: { nombre: DEPARTAMENTO.nombre } })

for (const [provId, prov] of Object.entries(PROVINCIAS)) {
  await db
    .insert(provincias)
    .values({ id: provId, departamentoId: DEPARTAMENTO.id, nombre: prov.nombre })
    .onConflictDoUpdate({ target: provincias.id, set: { nombre: prov.nombre } })

  const filas = Object.entries(prov.distritos).map(([id, nombre]) => ({
    id,
    provinciaId: provId,
    nombre,
  }))
  await db
    .insert(distritos)
    .values(filas)
    .onConflictDoUpdate({ target: distritos.id, set: { nombre: dsql`excluded.nombre` } })
}

await db
  .insert(categorias)
  .values(CATEGORIAS.map((c) => ({ ...c, slug: slugify(c.nombre) })))
  .onConflictDoNothing({ target: categorias.slug })

// Admin: se crea solo si no existe (no pisa una contraseña ya cambiada)
await db
  .insert(usuarios)
  .values({
    email: env.ADMIN_EMAIL,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    rol: 'admin',
  })
  .onConflictDoNothing({ target: usuarios.email })

console.log('Seed completado')
await sql.end()
