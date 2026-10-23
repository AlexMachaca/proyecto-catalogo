import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'
import type { ValidationTargets } from 'hono'

// Validador Zod con el formato de error de la API
export const validar = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (resultado, c) => {
    if (!resultado.success) {
      const detalles = resultado.error.issues.map((i) => ({
        campo: i.path.join('.'),
        mensaje: i.message,
      }))
      return c.json({ error: { codigo: 'validacion', mensaje: 'Datos inválidos', detalles } }, 400)
    }
  })
