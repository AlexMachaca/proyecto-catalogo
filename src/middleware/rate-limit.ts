import { getConnInfo } from '@hono/node-server/conninfo'
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { env } from '../config/env.js'

type Opciones = {
  /** Nombre del grupo: los contadores son independientes por grupo */
  nombre: string
  /** Máximo de peticiones por ventana */
  max: number
  ventanaMs: number
}

type Contador = { cuenta: number; reinicia: number }

// Contadores en memoria: suficientes para una sola instancia (MVP).
// Con varias instancias habría que moverlos a Redis/Postgres.
const contadores = new Map<string, Contador>()

setInterval(() => {
  const ahora = Date.now()
  for (const [k, v] of contadores) if (v.reinicia <= ahora) contadores.delete(k)
}, 60_000).unref()

export function ipCliente(c: Context): string {
  if (env.TRUST_PROXY) {
    const reenviada = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (reenviada) return reenviada
  }
  try {
    return getConnInfo(c).remote.address ?? 'desconocida'
  } catch {
    return 'desconocida'
  }
}

export const limitarPeticiones = ({ nombre, max, ventanaMs }: Opciones) =>
  createMiddleware(async (c, next) => {
    if (env.NODE_ENV === 'test' && c.req.header('x-test-rate-limit') !== 'on') return next()

    const clave = `${nombre}:${ipCliente(c)}`
    const ahora = Date.now()
    let actual = contadores.get(clave)
    if (!actual || actual.reinicia <= ahora) {
      actual = { cuenta: 0, reinicia: ahora + ventanaMs }
      contadores.set(clave, actual)
    }
    actual.cuenta++

    const restante = Math.max(0, max - actual.cuenta)
    c.header('RateLimit-Limit', String(max))
    c.header('RateLimit-Remaining', String(restante))
    if (actual.cuenta > max) {
      const espera = Math.ceil((actual.reinicia - ahora) / 1000)
      c.header('Retry-After', String(espera))
      return c.json(
        {
          error: {
            codigo: 'demasiadas_peticiones',
            mensaje: `Demasiados intentos. Vuelve a intentarlo en ${espera} segundos`,
          },
        },
        429,
      )
    }
    return next()
  })

/** Solo para tests */
export const reiniciarContadores = () => contadores.clear()
