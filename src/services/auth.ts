import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db } from '../db/client.js'
import { negocios, usuarios } from '../db/schema.js'
import { slugify } from '../lib/slug.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function slugLibre(tx: Tx, nombre: string): Promise<string> {
  const base = slugify(nombre) || 'negocio'
  const [existe] = await tx
    .select({ id: negocios.id })
    .from(negocios)
    .where(eq(negocios.slug, base))
    .limit(1)
  return existe ? `${base}-${randomBytes(2).toString('hex')}` : base
}

// Crea el usuario (rol negocio) y su negocio en estado "pendiente"
export function crearUsuarioNegocio(datos: {
  email: string
  passwordHash?: string
  googleId?: string
  nombreNegocio: string
  whatsapp?: string
}) {
  return db.transaction(async (tx) => {
    const [usuario] = await tx
      .insert(usuarios)
      .values({
        email: datos.email,
        passwordHash: datos.passwordHash ?? null,
        googleId: datos.googleId ?? null,
        rol: 'negocio',
      })
      .returning()
    const [negocio] = await tx
      .insert(negocios)
      .values({
        usuarioId: usuario!.id,
        nombre: datos.nombreNegocio,
        slug: await slugLibre(tx, datos.nombreNegocio),
        whatsapp: datos.whatsapp ?? null,
      })
      .returning()
    return { usuario: usuario!, negocio: negocio! }
  })
}
