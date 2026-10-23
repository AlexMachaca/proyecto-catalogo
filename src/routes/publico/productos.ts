import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError } from '../../lib/errores.js'
import { booleano, paginacion } from '../../lib/esquemas.js'
import { validar } from '../../lib/validar.js'
import { buscarProductos } from '../../services/busqueda.js'
import { productoPublicoDTO, productoPublico, negociosPublicos } from '../../services/catalogo.js'
import { enlaceWhatsapp } from '../../services/whatsapp.js'
import { db } from '../../db/client.js'
import { negocios } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

export const productosPublicos = new Hono()

export const filtrosComunes = {
  categoria: z.string().trim().max(100).optional(), // slug
  distrito: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  provincia: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  tipo: z.enum(['producto', 'servicio']).optional(),
  solo_disponibles: booleano.optional(),
  q: z.string().trim().max(100).optional(),
}

export const listaProductosSchema = paginacion.extend({
  ...filtrosComunes,
  orden: z.enum(['relevancia', 'recientes', 'precio_asc', 'precio_desc', 'descuento']).optional(),
})

const idParam = z.object({ id: z.coerce.number().int().positive() })

productosPublicos.get('/productos', validar('query', listaProductosSchema), async (c) => {
  const q = c.req.valid('query')
  const { filas, total } = await buscarProductos({
    q: q.q,
    categoria: q.categoria,
    tipo: q.tipo,
    distrito: q.distrito,
    provincia: q.provincia,
    soloDisponibles: q.solo_disponibles,
    orden: q.orden,
    pagina: q.pagina,
    limite: q.limite,
  })
  return c.json({ datos: filas.map(productoPublicoDTO), total, pagina: q.pagina, limite: q.limite })
})

// Productos con descuento, de negocios activos y disponibles
productosPublicos.get(
  '/ofertas',
  validar(
    'query',
    paginacion.extend({
      categoria: filtrosComunes.categoria,
      distrito: filtrosComunes.distrito,
      provincia: filtrosComunes.provincia,
      tipo: filtrosComunes.tipo,
    }),
  ),
  async (c) => {
    const q = c.req.valid('query')
    const { filas, total } = await buscarProductos({
      ...{ categoria: q.categoria, distrito: q.distrito, provincia: q.provincia, tipo: q.tipo },
      soloOfertas: true,
      soloDisponibles: true,
      orden: 'descuento',
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

productosPublicos.get('/productos/:id', validar('param', idParam), async (c) => {
  const f = await productoPublico(c.req.valid('param').id)
  const [negocio] = await db.select().from(negocios).where(eq(negocios.id, f.negocio.id)).limit(1)
  const [publico] = await negociosPublicos([negocio!])
  return c.json({ ...productoPublicoDTO(f), negocio: publico })
})

productosPublicos.get(
  '/productos/:id/whatsapp',
  validar('param', idParam),
  validar('query', z.object({ cantidad: z.coerce.number().int().min(1).max(99).default(1) })),
  async (c) => {
    const f = await productoPublico(c.req.valid('param').id)
    const [negocio] = await db.select().from(negocios).where(eq(negocios.id, f.negocio.id)).limit(1)
    if (!negocio!.whatsapp) {
      throw new ApiError(409, 'sin_whatsapp', 'El negocio no tiene WhatsApp registrado')
    }
    const r = enlaceWhatsapp({
      numero: negocio!.whatsapp,
      negocio: negocio!.nombre,
      producto: {
        id: f.producto.id,
        nombre: f.producto.nombre,
        tipo: f.producto.tipo,
        precio: Number(f.producto.precio),
        descuentoPct: f.producto.descuentoPct,
      },
      cantidad: c.req.valid('query').cantidad,
    })
    return c.json({ ...r, disponible: f.producto.disponible })
  },
)
