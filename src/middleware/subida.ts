import { bodyLimit } from 'hono/body-limit'
import { MAX_BYTES } from '../services/imgbb.js'

// Margen extra sobre 2 MB por el encabezado multipart
export const limiteSubida = bodyLimit({
  maxSize: MAX_BYTES + 64 * 1024,
  onError: (c) =>
    c.json(
      { error: { codigo: 'imagen_muy_grande', mensaje: 'La imagen supera el máximo de 2 MB' } },
      413,
    ),
})
