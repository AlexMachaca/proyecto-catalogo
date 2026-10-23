import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../../db/client.js'
import { negocios, productos, usuarios } from '../../db/schema.js'
import { ApiError } from '../../lib/errores.js'
import { categoriasAsignadasSchema, paginacion, perfilSchema } from '../../lib/esquemas.js'
import { snake } from '../../lib/respuesta.js'
import { validar } from '../../lib/validar.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { aplicarPerfil, asignarCategorias, perfilCompleto } from '../../services/negocios.js'

export const adminNegocios = new Hono<AuthEnv>()

const idParam = z.object({ id: z.coerce.number().int().positive() })

const listaSchema = paginacion.extend({
  estado: z.enum(['pendiente', 'activo', 'suspendido']).optional(),
  verificado: z.enum(['true', 'false']).optional(),
  distrito_id: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
})

const escaparLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`)

async function negocioPorId(id: number) {
  const [n] = await db.select().from(negocios).where(eq(negocios.id, id)).limit(1)
  if (!n) throw new ApiError(404, 'negocio_no_encontrado', 'Negocio no encontrado')
  return n
}

async function detalle(id: number) {
  const [[u], [p]] = await Promise.all([
    db
      .select({ id: usuarios.id, email: usuarios.email, googleId: usuarios.googleId })
      .from(negocios)
      .innerJoin(usuarios, eq(negocios.usuarioId, usuarios.id))
      .where(eq(negocios.id, id))
      .limit(1),
    db.select({ n: count() }).from(productos).where(eq(productos.negocioId, id)),
  ])
  return {
    ...(await perfilCompleto(id)),
    usuario: { id: u!.id, email: u!.email, tiene_google: !!u!.googleId },
    total_productos: p!.n,
  }
}

adminNegocios.get('/', validar('query', listaSchema), async (c) => {
  const q = c.req.valid('query')
  const filtros = and(
    q.estado ? eq(negocios.estado, q.estado) : undefined,
    q.verificado ? eq(negocios.verificado, q.verificado === 'true') : undefined,
    q.distrito_id ? eq(negocios.distritoId, q.distrito_id) : undefined,
    q.q
      ? or(
          ilike(negocios.nombre, `%${escaparLike(q.q)}%`),
          ilike(usuarios.email, `%${escaparLike(q.q)}%`),
          ilike(negocios.ruc, `%${escaparLike(q.q)}%`),
        )
      : undefined,
  )
  const [filas, [total]] = await Promise.all([
    db
      .select({
        id: negocios.id,
        nombre: negocios.nombre,
        slug: negocios.slug,
        logoUrl: negocios.logoUrl,
        ruc: negocios.ruc,
        whatsapp: negocios.whatsapp,
        distritoId: negocios.distritoId,
        estado: negocios.estado,
        verificado: negocios.verificado,
        puedeEditar: negocios.puedeEditar,
        creadoEn: negocios.creadoEn,
        email: usuarios.email,
      })
      .from(negocios)
      .innerJoin(usuarios, eq(negocios.usuarioId, usuarios.id))
      .where(filtros)
      .orderBy(desc(negocios.creadoEn))
      .limit(q.limite)
      .offset((q.pagina - 1) * q.limite),
    db
      .select({ n: count() })
      .from(negocios)
      .innerJoin(usuarios, eq(negocios.usuarioId, usuarios.id))
      .where(filtros),
  ])
  return c.json({ datos: snake(filas), total: total!.n, pagina: q.pagina, limite: q.limite })
})

adminNegocios.get('/:id', validar('param', idParam), async (c) => {
  const n = await negocioPorId(c.req.valid('param').id)
  return c.json(await detalle(n.id))
})

// El admin puede editar los datos aunque `puede_editar` sea false
adminNegocios.patch('/:id', validar('param', idParam), validar('json', perfilSchema), async (c) => {
  const n = await negocioPorId(c.req.valid('param').id)
  await aplicarPerfil(n.id, c.req.valid('json'))
  return c.json(await detalle(n.id))
})

adminNegocios.put(
  '/:id/categorias',
  validar('param', idParam),
  validar('json', categoriasAsignadasSchema),
  async (c) => {
    const n = await negocioPorId(c.req.valid('param').id)
    await asignarCategorias(n.id, c.req.valid('json').categoria_ids)
    return c.json(await detalle(n.id))
  },
)

const REQUERIDOS_VERIFICAR = {
  whatsapp: 'whatsapp',
  distritoId: 'distrito_id',
  direccion: 'direccion',
  ruc: 'ruc',
} as const

// Verifica el negocio: insignia de verificado y pasa a activo (visible al público)
adminNegocios.post('/:id/verificar', validar('param', idParam), async (c) => {
  const n = await negocioPorId(c.req.valid('param').id)
  const faltantes = Object.entries(REQUERIDOS_VERIFICAR)
    .filter(([campo]) => !n[campo as keyof typeof REQUERIDOS_VERIFICAR])
    .map(([, nombre]) => nombre)
  if (faltantes.length) {
    return c.json(
      {
        error: {
          codigo: 'perfil_incompleto',
          mensaje: 'Faltan datos para verificar el negocio',
          faltantes,
        },
      },
      409,
    )
  }
  await db
    .update(negocios)
    .set({ verificado: true, estado: 'activo', actualizadoEn: new Date() })
    .where(eq(negocios.id, n.id))
  return c.json(await detalle(n.id))
})

adminNegocios.post('/:id/baja', validar('param', idParam), async (c) => {
  const n = await negocioPorId(c.req.valid('param').id)
  await db
    .update(negocios)
    .set({ estado: 'suspendido', actualizadoEn: new Date() })
    .where(eq(negocios.id, n.id))
  return c.json(await detalle(n.id))
})

adminNegocios.post('/:id/reactivar', validar('param', idParam), async (c) => {
  const n = await negocioPorId(c.req.valid('param').id)
  if (n.estado === 'pendiente') {
    throw new ApiError(409, 'estado_invalido', 'El negocio aún no fue verificado; usa /verificar')
  }
  await db
    .update(negocios)
    .set({ estado: 'activo', actualizadoEn: new Date() })
    .where(eq(negocios.id, n.id))
  return c.json(await detalle(n.id))
})

adminNegocios.patch(
  '/:id/permisos',
  validar('param', idParam),
  validar('json', z.object({ puede_editar: z.boolean() })),
  async (c) => {
    const n = await negocioPorId(c.req.valid('param').id)
    await db
      .update(negocios)
      .set({ puedeEditar: c.req.valid('json').puede_editar, actualizadoEn: new Date() })
      .where(eq(negocios.id, n.id))
    return c.json(await detalle(n.id))
  },
)
