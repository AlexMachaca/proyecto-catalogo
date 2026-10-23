import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  categorias,
  departamentos,
  distritos,
  negocioCategorias,
  negocios,
  productos,
  provincias,
} from '../db/schema.js'
import { ApiError } from '../lib/errores.js'
import { snake } from '../lib/respuesta.js'
import { columnasCategoriaResumen, columnasNegocioResumen } from './busqueda.js'
import { productoDTO } from './productos.js'

type Fila = {
  producto: typeof productos.$inferSelect
  negocio: { id: number; nombre: string; slug: string; logoUrl: string | null; verificado: boolean }
  categoria: { id: number; nombre: string; slug: string } | null
}

export function productoPublicoDTO(f: Fila) {
  return {
    ...productoDTO(f.producto),
    negocio: snake(f.negocio),
    categoria: f.categoria ? snake(f.categoria) : null,
  }
}

export async function productoPublico(id: number) {
  const [f] = await db
    .select({
      producto: productos,
      negocio: columnasNegocioResumen,
      categoria: columnasCategoriaResumen,
    })
    .from(productos)
    .innerJoin(negocios, eq(productos.negocioId, negocios.id))
    .leftJoin(categorias, eq(productos.categoriaId, categorias.id))
    .where(and(eq(productos.id, id), eq(negocios.estado, 'activo')))
    .limit(1)
  if (!f) throw new ApiError(404, 'producto_no_encontrado', 'Producto no encontrado')
  return f
}

type NegocioFila = typeof negocios.$inferSelect

// Ubicación y categorías de varios negocios en 2 consultas
async function detallesNegocios(ids: number[]) {
  if (!ids.length) return { ubic: new Map(), cats: new Map() }
  const [ubicaciones, cats] = await Promise.all([
    db
      .select({
        negocioId: negocios.id,
        distrito: { id: distritos.id, nombre: distritos.nombre },
        provincia: { id: provincias.id, nombre: provincias.nombre },
        departamento: { id: departamentos.id, nombre: departamentos.nombre },
      })
      .from(negocios)
      .innerJoin(distritos, eq(negocios.distritoId, distritos.id))
      .innerJoin(provincias, eq(distritos.provinciaId, provincias.id))
      .innerJoin(departamentos, eq(provincias.departamentoId, departamentos.id))
      .where(inArray(negocios.id, ids)),
    db
      .select({
        negocioId: negocioCategorias.negocioId,
        id: categorias.id,
        nombre: categorias.nombre,
        slug: categorias.slug,
        tipo: categorias.tipo,
      })
      .from(negocioCategorias)
      .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
      .where(inArray(negocioCategorias.negocioId, ids)),
  ])
  const ubic = new Map(ubicaciones.map((u) => [u.negocioId, u]))
  const porNegocio = new Map<number, { id: number; nombre: string; slug: string; tipo: string }[]>()
  for (const { negocioId, ...c } of cats) {
    porNegocio.set(negocioId, [...(porNegocio.get(negocioId) ?? []), c])
  }
  return { ubic, cats: porNegocio }
}

// Forma pública de un negocio (sin datos internos como usuario, estado o permisos)
export async function negociosPublicos(filas: NegocioFila[], completo = false) {
  const { ubic, cats } = await detallesNegocios(filas.map((n) => n.id))
  return filas.map((n) => {
    const u = ubic.get(n.id)
    return snake({
      id: n.id,
      nombre: n.nombre,
      slug: n.slug,
      descripcion: n.descripcion,
      logoUrl: n.logoUrl,
      direccion: n.direccion,
      whatsapp: n.whatsapp,
      verificado: n.verificado,
      ubicacion: u
        ? { distrito: u.distrito, provincia: u.provincia, departamento: u.departamento }
        : null,
      categorias: cats.get(n.id) ?? [],
      ...(completo
        ? {
            ruc: n.ruc,
            facebook: n.facebook,
            instagram: n.instagram,
            tiktok: n.tiktok,
            sitioWeb: n.sitioWeb,
          }
        : {}),
    })
  })
}

export async function negocioActivoPorSlug(slug: string) {
  const [n] = await db
    .select()
    .from(negocios)
    .where(and(eq(negocios.slug, slug), eq(negocios.estado, 'activo')))
    .limit(1)
  if (!n) throw new ApiError(404, 'negocio_no_encontrado', 'Negocio no encontrado')
  return n
}
