import { and, count, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { productos } from '../../db/schema.js'
import { ApiError } from '../../lib/errores.js'
import { paginacion } from '../../lib/esquemas.js'
import { validar } from '../../lib/validar.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { limiteSubida } from '../../middleware/subida.js'
import { leerImagen, subirImagen } from '../../services/imgbb.js'
import { codigoPg, negocioActual } from '../../services/negocios.js'
import { productoDTO } from '../../services/productos.js'

export const misProductos = new Hono<AuthEnv>()

const idParam = z.object({ id: z.coerce.number().int().positive() })

const base = z.object({
  nombre: z.string().trim().min(2).max(150),
  descripcion: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  categoria_id: z.number().int().positive().nullable(),
  tipo: z.enum(['producto', 'servicio']),
  precio: z.number().min(0).max(99_999_999).multipleOf(0.01),
  descuento_pct: z.number().int().min(0).max(100),
  stock: z.number().int().min(0).max(1_000_000).nullable(),
  disponible: z.boolean(),
})

export const crearSchema = base.partial({
  descripcion: true,
  categoria_id: true,
  tipo: true,
  descuento_pct: true,
  stock: true,
  disponible: true,
})

export const editarSchema = base
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Envía al menos un campo')

export const stockSchema = z
  .object({ stock: z.number().int().min(0).max(1_000_000).nullable(), disponible: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Envía stock y/o disponible')

const listaSchema = paginacion.extend({
  categoria_id: z.coerce.number().int().positive().optional(),
  disponible: z.enum(['true', 'false']).optional(),
})

// Reglas: los servicios no llevan stock; stock 0 deja el producto no disponible
function normalizar(
  estado: { tipo: 'producto' | 'servicio'; stock: number | null; disponible: boolean },
  previo?: { stock: number | null },
  disponibleExplicito = true,
) {
  let { stock, disponible } = estado
  if (estado.tipo === 'servicio') stock = null
  if (stock === 0) disponible = false
  else if (!disponibleExplicito && previo?.stock === 0 && stock !== null && stock > 0)
    disponible = true
  return { stock, disponible }
}

async function productoPropio(negocioId: number, id: number) {
  const [p] = await db
    .select()
    .from(productos)
    .where(and(eq(productos.id, id), eq(productos.negocioId, negocioId)))
    .limit(1)
  if (!p) throw new ApiError(404, 'producto_no_encontrado', 'Producto no encontrado')
  return p
}

const errorCategoria = (e: unknown) => {
  if (codigoPg(e) === '23503')
    throw new ApiError(400, 'categoria_invalida', 'La categoría no existe')
  throw e
}

misProductos.get('/', validar('query', listaSchema), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  const q = c.req.valid('query')
  const filtros = and(
    eq(productos.negocioId, negocio.id),
    q.categoria_id ? eq(productos.categoriaId, q.categoria_id) : undefined,
    q.disponible ? eq(productos.disponible, q.disponible === 'true') : undefined,
  )
  const [filas, [total]] = await Promise.all([
    db
      .select()
      .from(productos)
      .where(filtros)
      .orderBy(desc(productos.id))
      .limit(q.limite)
      .offset((q.pagina - 1) * q.limite),
    db.select({ n: count() }).from(productos).where(filtros),
  ])
  return c.json({
    datos: filas.map(productoDTO),
    total: total!.n,
    pagina: q.pagina,
    limite: q.limite,
  })
})

misProductos.post('/', validar('json', crearSchema), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  const d = c.req.valid('json')
  const tipo = d.tipo ?? 'producto'
  const { stock, disponible } = normalizar({
    tipo,
    stock: d.stock ?? null,
    disponible: d.disponible ?? true,
  })
  try {
    const [p] = await db
      .insert(productos)
      .values({
        negocioId: negocio.id,
        categoriaId: d.categoria_id ?? null,
        tipo,
        nombre: d.nombre,
        descripcion: d.descripcion ?? null,
        precio: d.precio.toFixed(2),
        descuentoPct: d.descuento_pct ?? 0,
        stock,
        disponible,
      })
      .returning()
    return c.json(productoDTO(p!), 201)
  } catch (e) {
    return errorCategoria(e)
  }
})

misProductos.get('/:id', validar('param', idParam), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  return c.json(productoDTO(await productoPropio(negocio.id, c.req.valid('param').id)))
})

misProductos.patch('/:id', validar('param', idParam), validar('json', editarSchema), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  const previo = await productoPropio(negocio.id, c.req.valid('param').id)
  const d = c.req.valid('json')
  const { stock, disponible } = normalizar(
    {
      tipo: d.tipo ?? previo.tipo,
      stock: d.stock !== undefined ? d.stock : previo.stock,
      disponible: d.disponible ?? previo.disponible,
    },
    previo,
    d.disponible !== undefined,
  )
  try {
    const [p] = await db
      .update(productos)
      .set({
        nombre: d.nombre,
        descripcion: d.descripcion,
        categoriaId: d.categoria_id,
        tipo: d.tipo,
        precio: d.precio?.toFixed(2),
        descuentoPct: d.descuento_pct,
        stock,
        disponible,
        actualizadoEn: new Date(),
      })
      .where(eq(productos.id, previo.id))
      .returning()
    return c.json(productoDTO(p!))
  } catch (e) {
    return errorCategoria(e)
  }
})

// Atajo para actualizar stock y/o disponibilidad rápido
misProductos.patch(
  '/:id/stock',
  validar('param', idParam),
  validar('json', stockSchema),
  async (c) => {
    const negocio = await negocioActual(c.get('usuarioId'))
    const previo = await productoPropio(negocio.id, c.req.valid('param').id)
    const d = c.req.valid('json')
    const { stock, disponible } = normalizar(
      {
        tipo: previo.tipo,
        stock: d.stock !== undefined ? d.stock : previo.stock,
        disponible: d.disponible ?? previo.disponible,
      },
      previo,
      d.disponible !== undefined,
    )
    const [p] = await db
      .update(productos)
      .set({ stock, disponible, actualizadoEn: new Date() })
      .where(eq(productos.id, previo.id))
      .returning()
    return c.json(productoDTO(p!))
  },
)

misProductos.delete('/:id', validar('param', idParam), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  const previo = await productoPropio(negocio.id, c.req.valid('param').id)
  await db.delete(productos).where(eq(productos.id, previo.id))
  return c.body(null, 204)
})

misProductos.post('/:id/imagen', validar('param', idParam), limiteSubida, async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  const previo = await productoPropio(negocio.id, c.req.valid('param').id)
  const img = await leerImagen(await c.req.parseBody())
  const subida = await subirImagen(img, { nombre: `producto-${negocio.slug}-${previo.id}` })
  await db
    .update(productos)
    .set({ imagenUrl: subida.url, imagenDeleteUrl: subida.deleteUrl, actualizadoEn: new Date() })
    .where(eq(productos.id, previo.id))
  return c.json({ id: previo.id, imagen_url: subida.url })
})
