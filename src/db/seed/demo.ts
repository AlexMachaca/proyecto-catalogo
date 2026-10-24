// Datos de demostración para desarrollo: negocios y productos ficticios.
//   npm run db:seed:demo             -> (re)crea los datos demo
//   npm run db:seed:demo:limpiar     -> solo los elimina
// Todos los usuarios demo terminan en @demo.catalogo y comparten la contraseña de abajo.
import { like } from 'drizzle-orm'
import { env } from '../../config/env.js'
import { hashPassword } from '../../lib/password.js'
import { slugify } from '../../lib/slug.js'
import { db, sql } from '../client.js'
import { categorias, negocioCategorias, negocios, productos, usuarios } from '../schema.js'
import { NEGOCIOS_DEMO } from './demo-data.js'

const DOMINIO = '@demo.catalogo'
const PASSWORD_DEMO = 'demo12345'

if (env.NODE_ENV === 'production' && !process.argv.includes('--forzar')) {
  console.error('Los datos demo no se cargan en producción (usa --forzar si es intencional)')
  process.exit(1)
}

// RUC ficticio pero con dígito verificador válido (módulo 11 de SUNAT)
function rucFicticio(n: number): string {
  const base = `20${String(60_000_000 + n * 7919).padStart(8, '0')}`
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(base[i]), 0)
  return `${base}${(11 - (suma % 11)) % 10}`
}

// Borra los usuarios demo; sus negocios y productos se eliminan en cascada
const borrados = await db
  .delete(usuarios)
  .where(like(usuarios.email, `%${DOMINIO}`))
  .returning({ id: usuarios.id })
console.log(`Datos demo anteriores eliminados: ${borrados.length} negocios`)

if (process.argv.includes('--limpiar')) {
  await sql.end()
  process.exit(0)
}

const cats = new Map((await db.select().from(categorias)).map((c) => [c.slug, c.id]))
const catId = (slug: string) => {
  const id = cats.get(slug)
  if (!id) throw new Error(`Categoría inexistente: ${slug} (¿corriste npm run db:seed?)`)
  return id
}

const passwordHash = await hashPassword(PASSWORD_DEMO)
let totalProductos = 0

for (const [i, n] of NEGOCIOS_DEMO.entries()) {
  const slug = slugify(n.nombre)
  await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(usuarios)
      .values({ email: `${slug}${DOMINIO}`, passwordHash, rol: 'negocio' })
      .returning({ id: usuarios.id })
    const [neg] = await tx
      .insert(negocios)
      .values({
        usuarioId: u!.id,
        nombre: n.nombre,
        slug,
        descripcion: n.descripcion,
        direccion: n.direccion,
        distritoId: n.distrito,
        ruc: rucFicticio(i + 1),
        whatsapp: n.whatsapp,
        facebook: n.facebook ?? null,
        instagram: n.instagram ?? null,
        tiktok: n.tiktok ?? null,
        sitioWeb: n.sitioWeb ?? null,
        estado: n.estado,
        verificado: n.verificado,
        puedeEditar: n.puedeEditar ?? true,
      })
      .returning({ id: negocios.id })

    await tx
      .insert(negocioCategorias)
      .values(n.categorias.map((c) => ({ negocioId: neg!.id, categoriaId: catId(c) })))

    await tx.insert(productos).values(
      n.productos.map((p) => {
        const tipo = p.tipo ?? 'producto'
        const stock = tipo === 'servicio' ? null : (p.stock ?? null)
        return {
          negocioId: neg!.id,
          categoriaId: catId(p.categoria ?? n.categorias[0]!),
          tipo,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio.toFixed(2),
          descuentoPct: p.descuento ?? 0,
          stock,
          disponible: stock === 0 ? false : (p.disponible ?? true),
        }
      }),
    )
    totalProductos += n.productos.length
  })
}

const activos = NEGOCIOS_DEMO.filter((n) => n.estado === 'activo').length
console.log(
  `Demo cargada: ${NEGOCIOS_DEMO.length} negocios (${activos} activos, 1 pendiente, 1 suspendido) y ${totalProductos} productos/servicios`,
)
console.log(`Inicio de sesión de cualquier negocio demo: <slug>${DOMINIO} / ${PASSWORD_DEMO}`)
await sql.end()
