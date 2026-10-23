import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { categorias, negocioCategorias, negocios } from '../../db/schema.js'
import { snake } from '../../lib/respuesta.js'

export const categoriasPublicas = new Hono()

categoriasPublicas.get('/categorias', async (c) => {
  const filas = await db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      slug: categorias.slug,
      tipo: categorias.tipo,
      icono: categorias.icono,
      totalNegocios: sql<number>`(select count(*)::int from ${negocioCategorias}
        join ${negocios} on ${negocios.id} = ${negocioCategorias.negocioId}
        where ${negocioCategorias.categoriaId} = categorias.id and ${negocios.estado} = 'activo')`,
    })
    .from(categorias)
    .orderBy(categorias.nombre)
  return c.json(snake(filas))
})
