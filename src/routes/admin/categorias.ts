import { count, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { categorias, negocioCategorias, productos } from '../../db/schema.js'
import { ApiError } from '../../lib/errores.js'
import { snake } from '../../lib/respuesta.js'
import { slugify } from '../../lib/slug.js'
import { validar } from '../../lib/validar.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { codigoPg } from '../../services/negocios.js'

export const adminCategorias = new Hono<AuthEnv>()

const idParam = z.object({ id: z.coerce.number().int().positive() })
const nombre = z.string().trim().min(2).max(80)
const tipo = z.enum(['producto', 'servicio'])
const icono = z
  .string()
  .trim()
  .max(50)
  .nullable()
  .transform((v) => (v === '' ? null : v))

export const crearSchema = z.object({
  nombre,
  tipo: tipo.default('producto'),
  icono: icono.optional(),
})
export const editarSchema = z
  .object({ nombre, tipo, icono })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Envía al menos un campo')

const duplicada = (e: unknown) => {
  if (codigoPg(e) === '23505') {
    throw new ApiError(409, 'categoria_duplicada', 'Ya existe una categoría con ese nombre')
  }
  throw e
}

adminCategorias.get('/', async (c) => {
  const filas = await db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      slug: categorias.slug,
      tipo: categorias.tipo,
      icono: categorias.icono,
      totalNegocios: sql<number>`(select count(*)::int from ${negocioCategorias} where ${negocioCategorias.categoriaId} = ${categorias.id})`,
      totalProductos: sql<number>`(select count(*)::int from ${productos} where ${productos.categoriaId} = ${categorias.id})`,
    })
    .from(categorias)
    .orderBy(categorias.nombre)
  return c.json(snake(filas))
})

adminCategorias.post('/', validar('json', crearSchema), async (c) => {
  const d = c.req.valid('json')
  try {
    const [cat] = await db
      .insert(categorias)
      .values({ nombre: d.nombre, slug: slugify(d.nombre), tipo: d.tipo, icono: d.icono ?? null })
      .returning()
    return c.json(snake(cat), 201)
  } catch (e) {
    return duplicada(e)
  }
})

adminCategorias.patch(
  '/:id',
  validar('param', idParam),
  validar('json', editarSchema),
  async (c) => {
    const d = c.req.valid('json')
    try {
      const [cat] = await db
        .update(categorias)
        .set({
          nombre: d.nombre,
          slug: d.nombre ? slugify(d.nombre) : undefined,
          tipo: d.tipo,
          icono: d.icono,
        })
        .where(eq(categorias.id, c.req.valid('param').id))
        .returning()
      if (!cat) throw new ApiError(404, 'categoria_no_encontrada', 'Categoría no encontrada')
      return c.json(snake(cat))
    } catch (e) {
      return duplicada(e)
    }
  },
)

// No se borra una categoría en uso para no dejar negocios/productos sin categoría sin querer
adminCategorias.delete('/:id', validar('param', idParam), async (c) => {
  const { id } = c.req.valid('param')
  const [[nNegocios], [nProductos]] = await Promise.all([
    db.select({ n: count() }).from(negocioCategorias).where(eq(negocioCategorias.categoriaId, id)),
    db.select({ n: count() }).from(productos).where(eq(productos.categoriaId, id)),
  ])
  if (nNegocios!.n + nProductos!.n > 0) {
    throw new ApiError(
      409,
      'categoria_en_uso',
      `La categoría está en uso (${nNegocios!.n} negocios, ${nProductos!.n} productos)`,
    )
  }
  const [borrada] = await db
    .delete(categorias)
    .where(eq(categorias.id, id))
    .returning({ id: categorias.id })
  if (!borrada) throw new ApiError(404, 'categoria_no_encontrada', 'Categoría no encontrada')
  return c.body(null, 204)
})
