import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'
import { ApiError } from '../lib/errores.js'

const cliente = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null

export type PerfilGoogle = { googleId: string; email: string; nombre: string | null }

export async function verificarIdToken(idToken: string): Promise<PerfilGoogle> {
  if (!cliente) {
    throw new ApiError(503, 'google_no_configurado', 'El acceso con Google aún no está configurado')
  }
  try {
    const ticket = await cliente.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID })
    const p = ticket.getPayload()
    if (!p?.sub || !p.email || !p.email_verified) throw new Error('perfil incompleto')
    return { googleId: p.sub, email: p.email.toLowerCase(), nombre: p.name ?? null }
  } catch {
    throw new ApiError(401, 'google_token_invalido', 'Token de Google inválido')
  }
}
