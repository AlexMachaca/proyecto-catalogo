import { Hono } from 'hono'
import { z } from 'zod'
import { validar } from '../../lib/validar.js'
import { buscarNegocios, buscarProductos, quisisteDecir, sugerir } from '../../services/busqueda.js'
import { negociosPublicos, productoPublicoDTO } from '../../services/catalogo.js'
import { listaProductosSchema } from './productos.js'

export const buscar = new Hono()

const buscarSchema = listaProductosSchema.extend({
  q: z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(100),
  limite_negocios: z.coerce.number().int().min(0).max(20).default(5),
})

buscar.get('/buscar', validar('query', buscarSchema), async (c) => {
  const q = c.req.valid('query')
  const [prods, negs] = await Promise.all([
    buscarProductos({
      q: q.q,
      categoria: q.categoria,
      tipo: q.tipo,
      distrito: q.distrito,
      provincia: q.provincia,
      soloDisponibles: q.solo_disponibles,
      orden: q.orden,
      pagina: q.pagina,
      limite: q.limite,
    }),
    q.limite_negocios > 0
      ? buscarNegocios({
          q: q.q,
          categoria: q.categoria,
          distrito: q.distrito,
          provincia: q.provincia,
          pagina: 1,
          limite: q.limite_negocios,
        })
      : Promise.resolve({ filas: [], total: 0 }),
  ])
  const sinResultados = prods.total === 0 && negs.total === 0
  return c.json({
    q: q.q,
    sugerencia: sinResultados ? await quisisteDecir(q.q) : null,
    productos: {
      datos: prods.filas.map(productoPublicoDTO),
      total: prods.total,
      pagina: q.pagina,
      limite: q.limite,
    },
    negocios: { datos: await negociosPublicos(negs.filas), total: negs.total },
  })
})

buscar.get(
  '/buscar/sugerencias',
  validar('query', z.object({ q: z.string().trim().max(100).default('') })),
  async (c) => c.json({ sugerencias: await sugerir(c.req.valid('query').q) }),
)
