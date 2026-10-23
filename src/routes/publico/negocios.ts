import { count, eq, and, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { productos } from '../../db/schema.js'
import { booleano, paginacion } from '../../lib/esquemas.js'
import { validar } from '../../lib/validar.js'
import { buscarNegocios, buscarProductos } from '../../services/busqueda.js'
import {
  negocioActivoPorSlug,
  negociosPublicos,
  productoPublicoDTO,
} from '../../services/catalogo.js'
import { filtrosComunes } from './productos.js'

export const negociosRutas = new Hono()

const slugParam = z.object({ slug: z.string().min(1).max(140) })

negociosRutas.get(
  '/negocios',
  validar(
    'query',
    paginacion.extend({
      q: filtrosComunes.q,
      categoria: filtrosComunes.categoria,
      distrito: filtrosComunes.distrito,
      provincia: filtrosComunes.provincia,
    }),
  ),
  async (c) => {
    const q = c.req.valid('query')
    const { filas, total } = await buscarNegocios(q)
    return c.json({
      datos: await negociosPublicos(filas),
      total,
      pagina: q.pagina,
      limite: q.limite,
    })
  },
)

// Página de la tienda
negociosRutas.get('/negocios/:slug', validar('param', slugParam), async (c) => {
  const n = await negocioActivoPorSlug(c.req.valid('param').slug)
  const [[datos], [totales]] = await Promise.all([
    negociosPublicos([n], true),
    db
      .select({
        productos: count(),
        ofertas: sql<number>`count(*) filter (where ${productos.descuentoPct} > 0 and ${productos.disponible})::int`,
      })
      .from(productos)
      .where(and(eq(productos.negocioId, n.id))),
  ])
  return c.json({
    ...(datos as object),
    total_productos: totales!.productos,
    total_ofertas: totales!.ofertas,
  })
})

negociosRutas.get(
  '/negocios/:slug/productos',
  validar('param', slugParam),
  validar(
    'query',
    paginacion.extend({
      q: filtrosComunes.q,
      categoria: filtrosComunes.categoria,
      tipo: filtrosComunes.tipo,
      solo_disponibles: booleano.optional(),
      orden: z
        .enum(['relevancia', 'recientes', 'precio_asc', 'precio_desc', 'descuento'])
        .optional(),
    }),
  ),
  async (c) => {
    const n = await negocioActivoPorSlug(c.req.valid('param').slug)
    const q = c.req.valid('query')
    const { filas, total } = await buscarProductos({
      q: q.q,
      categoria: q.categoria,
      tipo: q.tipo,
      soloDisponibles: q.solo_disponibles,
      orden: q.orden,
      negocioId: n.id,
      pagina: q.pagina,
      limite: q.limite,
    })
    return c.json({
      datos: filas.map(productoPublicoDTO),
      total,
      pagina: q.pagina,
      limite: q.limite,
    })
  },
)
