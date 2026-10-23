import { createMiddleware } from 'hono/factory'
import { ApiError } from '../lib/errores.js'
import { verificarToken, type Rol } from '../lib/jwt.js'

export type AuthEnv = { Variables: { usuarioId: number; rol: Rol } }

export const requiereAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const cabecera = c.req.header('Authorization')
  const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : null
  if (!token) throw new ApiError(401, 'no_autenticado', 'Falta el token de acceso')
  try {
    const payload = await verificarToken(token)
    c.set('usuarioId', Number(payload.sub))
    c.set('rol', payload.rol)
  } catch {
    throw new ApiError(401, 'token_invalido', 'Token inválido o expirado')
  }
  await next()
})

export const requiereRol = (...roles: Rol[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (!roles.includes(c.get('rol'))) {
      throw new ApiError(403, 'prohibido', 'No tienes permiso para esta acción')
    }
    await next()
  })
