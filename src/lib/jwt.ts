import { sign, verify } from 'hono/jwt'
import { env } from '../config/env.js'

export type Rol = 'negocio' | 'admin'
export type TokenPayload = { sub: number; rol: Rol; exp: number }

const UNIDADES: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }

function aSegundos(valor: string): number {
  const m = /^(\d+)([smhd])$/.exec(valor)
  if (!m) throw new Error(`JWT_EXPIRES_IN inválido: ${valor}`)
  return Number(m[1]) * UNIDADES[m[2]!]!
}

export const firmarToken = (usuarioId: number, rol: Rol) =>
  sign(
    { sub: usuarioId, rol, exp: Math.floor(Date.now() / 1000) + aSegundos(env.JWT_EXPIRES_IN) },
    env.JWT_SECRET,
    'HS256',
  )

export const verificarToken = async (token: string) =>
  (await verify(token, env.JWT_SECRET, 'HS256')) as unknown as TokenPayload
