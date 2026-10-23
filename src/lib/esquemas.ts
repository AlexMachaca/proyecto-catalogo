import { z } from 'zod'

// Acepta "987654321", "+51 987 654 321", "51987654321" y lo guarda como 519XXXXXXXX
export const whatsapp = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .transform((v) => (/^9\d{8}$/.test(v) ? `51${v}` : v))
  .refine(
    (v) => /^519\d{8}$/.test(v),
    'Número de celular peruano inválido (9 dígitos, empieza con 9)',
  )

// RUC peruano: 11 dígitos, prefijo válido y dígito verificador (módulo 11 de SUNAT)
export const ruc = z
  .string()
  .trim()
  .refine((v) => /^(10|15|16|17|20)\d{9}$/.test(v), 'RUC inválido (11 dígitos)')
  .refine((v) => {
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    const suma = pesos.reduce((acc, p, i) => acc + p * Number(v[i]), 0)
    const dv = (11 - (suma % 11)) % 10
    return dv === Number(v[10])
  }, 'RUC inválido (dígito verificador)')

export const urlHttp = z
  .string()
  .trim()
  .max(255)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Debe empezar con http:// o https://')

// Texto opcional que se puede borrar enviando null o ""
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v))

export const paginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
})

const redSocial = urlHttp.nullable().or(z.literal('').transform(() => null))

// Campos editables del perfil de un negocio (todos opcionales, al menos uno)
export const perfilSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120),
    descripcion: textoOpcional(1000),
    direccion: textoOpcional(255),
    distrito_id: z.string().regex(/^03\d{4}$/, 'Código de distrito inválido'),
    ruc: ruc.nullable().or(z.literal('').transform(() => null)),
    whatsapp,
    facebook: redSocial,
    instagram: redSocial,
    tiktok: redSocial,
    sitio_web: redSocial,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Envía al menos un campo')

export const categoriasAsignadasSchema = z.object({
  categoria_ids: z.array(z.number().int().positive()).max(5, 'Máximo 5 categorías'),
})

// Parámetro booleano de query string: true|false|1|0
export const booleano = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
