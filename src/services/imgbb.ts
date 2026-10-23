import { env } from '../config/env.js'
import { ApiError } from '../lib/errores.js'

const URL_SUBIDA = 'https://api.imgbb.com/1/upload'

export const MAX_BYTES = 2 * 1024 * 1024
const TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const
type Mime = keyof typeof TIPOS

export type ImagenSubida = { url: string; deleteUrl: string }

// Detecta el tipo real por los primeros bytes (no confiamos en el Content-Type del cliente)
function detectarMime(b: Uint8Array): Mime | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v))
    return 'image/png'
  const ascii = (desde: number, n: number) => String.fromCharCode(...b.slice(desde, desde + n))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  return null
}

// Extrae y valida el archivo del campo multipart `campo`
export async function leerImagen(body: Record<string, unknown>, campo = 'imagen') {
  const archivo = body[campo]
  if (!(archivo instanceof File)) {
    throw new ApiError(
      400,
      'imagen_requerida',
      `Envía la imagen en el campo "${campo}" (multipart/form-data)`,
    )
  }
  if (archivo.size === 0) throw new ApiError(400, 'imagen_vacia', 'El archivo está vacío')
  if (archivo.size > MAX_BYTES) {
    throw new ApiError(413, 'imagen_muy_grande', 'La imagen supera el máximo de 2 MB')
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const mime = detectarMime(bytes)
  if (!mime) {
    throw new ApiError(415, 'imagen_formato_invalido', 'Formato no permitido. Usa JPG, PNG o WEBP')
  }
  return { bytes, mime, extension: TIPOS[mime] }
}

export async function subirImagen(
  img: { bytes: Uint8Array; mime: string; extension: string },
  opciones: { nombre?: string; expiracionSegundos?: number } = {},
): Promise<ImagenSubida> {
  const form = new FormData()
  form.set('key', env.IMGBB_API_KEY)
  form.set(
    'image',
    new Blob([img.bytes as BlobPart], { type: img.mime }),
    `imagen.${img.extension}`,
  )
  if (opciones.nombre) form.set('name', opciones.nombre)
  if (opciones.expiracionSegundos) form.set('expiration', String(opciones.expiracionSegundos))

  let res: Response
  try {
    res = await fetch(URL_SUBIDA, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ApiError(502, 'imgbb_no_disponible', 'No se pudo contactar al servicio de imágenes')
  }

  const json = (await res.json().catch(() => null)) as {
    success?: boolean
    data?: { url?: string; delete_url?: string }
    error?: { message?: string }
  } | null
  if (!res.ok || !json?.success || !json.data?.url || !json.data.delete_url) {
    console.error('imgbb respondió con error', res.status, json?.error?.message)
    throw new ApiError(502, 'imgbb_error', 'El servicio de imágenes rechazó la subida')
  }
  return { url: json.data.url, deleteUrl: json.data.delete_url }
}
