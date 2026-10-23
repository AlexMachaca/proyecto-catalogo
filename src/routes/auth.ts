import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client.js'
import { negocios, usuarios } from '../db/schema.js'
import { ApiError } from '../lib/errores.js'
import { firmarToken } from '../lib/jwt.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { whatsapp } from '../lib/esquemas.js'
import { snake } from '../lib/respuesta.js'
import { validar } from '../lib/validar.js'
import { limitarPeticiones } from '../middleware/rate-limit.js'
import { requiereAuth, type AuthEnv } from '../middleware/auth.js'
import { crearUsuarioNegocio } from '../services/auth.js'
import { verificarIdToken } from '../services/google.js'

const email = z.string().trim().toLowerCase().email().max(255)
export const registroSchema = z.object({
  email,
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
  nombre_negocio: z.string().trim().min(2).max(120),
  whatsapp: whatsapp.optional(),
})
export const loginSchema = z.object({ email, password: z.string().min(1).max(72) })
export const googleSchema = z.object({
  id_token: z.string().min(10),
  nombre_negocio: z.string().trim().min(2).max(120).optional(),
})

const respuestaSesion = async (u: { id: number; email: string; rol: 'negocio' | 'admin' }) => ({
  token: await firmarToken(u.id, u.rol),
  usuario: { id: u.id, email: u.email, rol: u.rol },
})

// Drizzle envuelve el error de postgres en `cause`
const esViolacionUnica = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: unknown } | null
  return err?.code === '23505' || (err?.cause != null && esViolacionUnica(err.cause))
}

export const auth = new Hono<AuthEnv>()

// Frena la fuerza bruta y el registro masivo (por IP)
auth.use('/login', limitarPeticiones({ nombre: 'login', max: 10, ventanaMs: 15 * 60_000 }))
auth.use('/google', limitarPeticiones({ nombre: 'google', max: 20, ventanaMs: 15 * 60_000 }))
auth.use('/registro', limitarPeticiones({ nombre: 'registro', max: 5, ventanaMs: 60 * 60_000 }))

auth.post('/registro', validar('json', registroSchema), async (c) => {
  const d = c.req.valid('json')
  try {
    const { usuario, negocio } = await crearUsuarioNegocio({
      email: d.email,
      passwordHash: await hashPassword(d.password),
      nombreNegocio: d.nombre_negocio,
      whatsapp: d.whatsapp,
    })
    return c.json(
      {
        ...(await respuestaSesion(usuario)),
        negocio: { id: negocio.id, slug: negocio.slug, estado: negocio.estado },
      },
      201,
    )
  } catch (e) {
    if (esViolacionUnica(e))
      throw new ApiError(409, 'email_en_uso', 'Ese correo ya está registrado')
    throw e
  }
})

auth.post('/login', validar('json', loginSchema), async (c) => {
  const d = c.req.valid('json')
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, d.email)).limit(1)
  const ok = u?.passwordHash ? await verifyPassword(u.passwordHash, d.password) : false
  if (!u || !ok)
    throw new ApiError(401, 'credenciales_invalidas', 'Correo o contraseña incorrectos')
  return c.json(await respuestaSesion(u))
})

auth.post('/google', validar('json', googleSchema), async (c) => {
  const d = c.req.valid('json')
  const g = await verificarIdToken(d.id_token)

  const [porGoogle] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.googleId, g.googleId))
    .limit(1)
  let usuario = porGoogle
  if (!usuario) {
    const [porEmail] = await db.select().from(usuarios).where(eq(usuarios.email, g.email)).limit(1)
    if (porEmail) {
      if (porEmail.rol === 'admin') {
        throw new ApiError(
          403,
          'prohibido',
          'Las cuentas de administrador usan correo y contraseña',
        )
      }
      // Cuenta existente con ese correo (verificado por Google): se vincula
      ;[usuario] = await db
        .update(usuarios)
        .set({ googleId: g.googleId })
        .where(eq(usuarios.id, porEmail.id))
        .returning()
    } else {
      ;({ usuario } = await crearUsuarioNegocio({
        email: g.email,
        googleId: g.googleId,
        nombreNegocio: d.nombre_negocio ?? g.nombre ?? g.email.split('@')[0]!,
      }))
    }
  }
  if (usuario!.rol === 'admin') {
    throw new ApiError(403, 'prohibido', 'Las cuentas de administrador usan correo y contraseña')
  }
  return c.json(await respuestaSesion(usuario!))
})

auth.get('/me', requiereAuth, async (c) => {
  const [u] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, c.get('usuarioId')))
    .limit(1)
  if (!u) throw new ApiError(401, 'token_invalido', 'El usuario ya no existe')
  const [n] = await db
    .select({
      id: negocios.id,
      nombre: negocios.nombre,
      slug: negocios.slug,
      estado: negocios.estado,
      verificado: negocios.verificado,
      puedeEditar: negocios.puedeEditar,
    })
    .from(negocios)
    .where(eq(negocios.usuarioId, u.id))
    .limit(1)
  return c.json(
    snake({
      usuario: { id: u.id, email: u.email, rol: u.rol, tieneGoogle: !!u.googleId },
      negocio: n ?? null,
    }),
  )
})
