import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { departamentos, distritos, provincias } from '../../db/schema.js'
import { snake } from '../../lib/respuesta.js'
import { validar } from '../../lib/validar.js'

export const ubicaciones = new Hono()

// El UBIGEO casi no cambia: se puede cachear
ubicaciones.use(async (c, next) => {
  await next()
  c.header('Cache-Control', 'public, max-age=3600')
})

ubicaciones.get('/departamentos', async (c) =>
  c.json(await db.select().from(departamentos).orderBy(asc(departamentos.nombre))),
)

ubicaciones.get(
  '/provincias',
  validar(
    'query',
    z.object({
      departamento_id: z
        .string()
        .regex(/^\d{2}$/)
        .optional(),
    }),
  ),
  async (c) => {
    const { departamento_id } = c.req.valid('query')
    const filas = await db
      .select()
      .from(provincias)
      .where(departamento_id ? eq(provincias.departamentoId, departamento_id) : undefined)
      .orderBy(asc(provincias.nombre))
    return c.json(snake(filas))
  },
)

ubicaciones.get(
  '/distritos',
  validar(
    'query',
    z.object({
      provincia_id: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    }),
  ),
  async (c) => {
    const { provincia_id } = c.req.valid('query')
    const filas = await db
      .select()
      .from(distritos)
      .where(provincia_id ? eq(distritos.provinciaId, provincia_id) : undefined)
      .orderBy(asc(distritos.nombre))
    return c.json(snake(filas))
  },
)
