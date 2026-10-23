import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { negocios } from '../../db/schema.js'
import { categoriasAsignadasSchema, perfilSchema } from '../../lib/esquemas.js'
import { validar } from '../../lib/validar.js'
import type { AuthEnv } from '../../middleware/auth.js'
import { limiteSubida } from '../../middleware/subida.js'
import { leerImagen, subirImagen } from '../../services/imgbb.js'
import {
  aplicarPerfil,
  asignarCategorias,
  exigirEdicion,
  negocioActual,
  perfilCompleto,
} from '../../services/negocios.js'

export const perfil = new Hono<AuthEnv>()

perfil.get('/', async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  return c.json(await perfilCompleto(negocio.id))
})

perfil.patch('/', validar('json', perfilSchema), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  exigirEdicion(negocio)
  await aplicarPerfil(negocio.id, c.req.valid('json'))
  return c.json(await perfilCompleto(negocio.id))
})

perfil.put('/categorias', validar('json', categoriasAsignadasSchema), async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  exigirEdicion(negocio)
  await asignarCategorias(negocio.id, c.req.valid('json').categoria_ids)
  return c.json(await perfilCompleto(negocio.id))
})

perfil.post('/logo', limiteSubida, async (c) => {
  const negocio = await negocioActual(c.get('usuarioId'))
  exigirEdicion(negocio)
  const img = await leerImagen(await c.req.parseBody())
  const subida = await subirImagen(img, { nombre: `logo-${negocio.slug}` })
  await db
    .update(negocios)
    .set({ logoUrl: subida.url, logoDeleteUrl: subida.deleteUrl, actualizadoEn: new Date() })
    .where(eq(negocios.id, negocio.id))
  return c.json({ logo_url: subida.url })
})
