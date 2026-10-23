import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'
import { db } from '../db/client.js'
import { categorias, distritos, negocioCategorias, negocios, productos } from '../db/schema.js'

// ---------- Normalización ----------

// minúsculas, sin tildes ni signos; solo [a-z0-9] y espacios (seguro para LIKE y tsquery)
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
}

// Misma normalización que `normalizar`, hecha en SQL sobre una columna
const nz = (col: SQLWrapper) => sql`f_unaccent(lower(${col}))`

// Debe coincidir con la expresión del índice `productos_fts_idx`
const tsvProducto = sql`to_tsvector('spanish', f_unaccent(${productos.nombre} || ' ' || coalesce(${productos.descripcion}, '')))`

function tsquery(qn: string): SQL | null {
  const palabras = qn
    .split(' ')
    .filter((w) => w.length >= 2)
    .slice(0, 6)
  if (!palabras.length) return null
  return sql`to_tsquery('spanish', ${palabras.map((w) => `${w}:*`).join(' & ')})`
}

const UMBRAL_NOMBRE = 0.45 // word_similarity mínima para tolerar errores de tipeo
const UMBRAL_NEGOCIO = 0.6

// ---------- Productos ----------

export type OrdenProductos = 'relevancia' | 'recientes' | 'precio_asc' | 'precio_desc' | 'descuento'

export type FiltrosProductos = {
  q?: string
  categoria?: string // slug
  tipo?: 'producto' | 'servicio'
  distrito?: string
  provincia?: string
  soloDisponibles?: boolean
  soloOfertas?: boolean
  negocioId?: number
  orden?: OrdenProductos
  pagina: number
  limite: number
}

const filtroCategoria = (slug: string) =>
  or(
    eq(categorias.slug, slug),
    exists(
      db
        .select({ x: sql`1` })
        .from(negocioCategorias)
        .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
        .where(and(eq(negocioCategorias.negocioId, negocios.id), eq(categorias.slug, slug))),
    ),
  )

const filtroUbicacion = (distrito?: string, provincia?: string) => [
  distrito ? eq(negocios.distritoId, distrito) : undefined,
  provincia
    ? inArray(
        negocios.distritoId,
        db.select({ id: distritos.id }).from(distritos).where(eq(distritos.provinciaId, provincia)),
      )
    : undefined,
]

// El negocio tiene una categoría cuyo nombre contiene la búsqueda
const categoriaDelNegocioContiene = (contiene: string) =>
  exists(
    db
      .select({ x: sql`1` })
      .from(negocioCategorias)
      .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
      .where(
        and(
          eq(negocioCategorias.negocioId, negocios.id),
          sql`${nz(categorias.nombre)} like ${contiene}`,
        ),
      ),
  )

function coincideProducto(qn: string): SQL {
  const contiene = `%${qn}%`
  const tsq = tsquery(qn)
  const nombre = nz(productos.nombre)
  const negocio = nz(negocios.nombre)
  return or(
    sql`${nombre} like ${contiene}`,
    tsq ? sql`${tsvProducto} @@ ${tsq}` : undefined,
    sql`word_similarity(${qn}, ${nombre}) >= ${UMBRAL_NOMBRE}`,
    sql`${nz(categorias.nombre)} like ${contiene}`,
    sql`${negocio} like ${contiene}`,
    sql`word_similarity(${qn}, ${negocio}) >= ${UMBRAL_NEGOCIO}`,
    categoriaDelNegocioContiene(contiene),
  )!
}

// Exacto > prefijo > contiene > full-text > similitud; categoría y negocio suman poco
function puntajeProducto(qn: string): SQL<number> {
  const contiene = `%${qn}%`
  const nombre = nz(productos.nombre)
  const tsq = tsquery(qn)
  return sql<number>`(
    case when ${nombre} = ${qn} then 100
         when ${nombre} like ${qn + '%'} then 60
         when ${nombre} like ${contiene} then 45 else 0 end
    + ${tsq ? sql`case when ${tsvProducto} @@ ${tsq} then 30 + 10 * ts_rank(${tsvProducto}, ${tsq}) else 0 end` : sql`0`}
    + 20 * word_similarity(${qn}, ${nombre})
    + case when ${nz(categorias.nombre)} like ${contiene} then 10 else 0 end
    + case when ${nz(negocios.nombre)} like ${contiene} then 8 else 0 end
    + case when ${categoriaDelNegocioContiene(contiene)} then 6 else 0 end
  )`
}

const precioFinalSql = sql`(${productos.precio} * (100 - ${productos.descuentoPct}))`

export const columnasNegocioResumen = {
  id: negocios.id,
  nombre: negocios.nombre,
  slug: negocios.slug,
  logoUrl: negocios.logoUrl,
  verificado: negocios.verificado,
}

export const columnasCategoriaResumen = {
  id: categorias.id,
  nombre: categorias.nombre,
  slug: categorias.slug,
}

export async function buscarProductos(f: FiltrosProductos) {
  const qn = f.q ? normalizar(f.q) : ''
  if (f.q?.trim() && !qn) return { filas: [], total: 0 } // solo símbolos: nada que buscar
  const where = and(
    eq(negocios.estado, 'activo'),
    f.negocioId ? eq(productos.negocioId, f.negocioId) : undefined,
    f.tipo ? eq(productos.tipo, f.tipo) : undefined,
    f.soloDisponibles ? eq(productos.disponible, true) : undefined,
    f.soloOfertas ? sql`${productos.descuentoPct} > 0` : undefined,
    f.categoria ? filtroCategoria(f.categoria) : undefined,
    ...filtroUbicacion(f.distrito, f.provincia),
    qn ? coincideProducto(qn) : undefined,
  )
  const score = qn ? puntajeProducto(qn) : sql<number>`0`

  let orden: SQL[]
  switch (f.orden ?? 'relevancia') {
    case 'precio_asc':
      orden = [asc(precioFinalSql), desc(productos.id)]
      break
    case 'precio_desc':
      orden = [desc(precioFinalSql), desc(productos.id)]
      break
    case 'descuento':
      orden = [desc(productos.descuentoPct), desc(productos.id)]
      break
    case 'recientes':
      orden = [desc(productos.id)]
      break
    default:
      orden = qn
        ? [desc(score), desc(sql`${productos.descuentoPct} > 0`), desc(productos.id)]
        : [desc(productos.id)]
  }

  const desde = db
    .select({
      producto: productos,
      negocio: columnasNegocioResumen,
      categoria: columnasCategoriaResumen,
    })
    .from(productos)
    .innerJoin(negocios, eq(productos.negocioId, negocios.id))
    .leftJoin(categorias, eq(productos.categoriaId, categorias.id))
    .where(where)

  const [datos, [total]] = await Promise.all([
    desde
      // los no disponibles siempre al final
      .orderBy(desc(productos.disponible), ...orden)
      .limit(f.limite)
      .offset((f.pagina - 1) * f.limite),
    db
      .select({ n: count() })
      .from(productos)
      .innerJoin(negocios, eq(productos.negocioId, negocios.id))
      .leftJoin(categorias, eq(productos.categoriaId, categorias.id))
      .where(where),
  ])
  return { filas: datos, total: total!.n }
}

// ---------- Negocios ----------

export type FiltrosNegocios = {
  q?: string
  categoria?: string
  distrito?: string
  provincia?: string
  pagina: number
  limite: number
}

export async function buscarNegocios(f: FiltrosNegocios) {
  const qn = f.q ? normalizar(f.q) : ''
  if (f.q?.trim() && !qn) return { filas: [], total: 0 }
  const contiene = `%${qn}%`
  const nombre = nz(negocios.nombre)
  const coincide = qn
    ? or(
        sql`${nombre} like ${contiene}`,
        sql`word_similarity(${qn}, ${nombre}) >= ${UMBRAL_NEGOCIO}`,
        exists(
          db
            .select({ x: sql`1` })
            .from(negocioCategorias)
            .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
            .where(
              and(
                eq(negocioCategorias.negocioId, negocios.id),
                sql`${nz(categorias.nombre)} like ${contiene}`,
              ),
            ),
        ),
      )
    : undefined
  const where = and(
    eq(negocios.estado, 'activo'),
    f.categoria
      ? exists(
          db
            .select({ x: sql`1` })
            .from(negocioCategorias)
            .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
            .where(
              and(eq(negocioCategorias.negocioId, negocios.id), eq(categorias.slug, f.categoria)),
            ),
        )
      : undefined,
    ...filtroUbicacion(f.distrito, f.provincia),
    coincide,
  )
  const score = qn
    ? sql<number>`(case when ${nombre} = ${qn} then 100 when ${nombre} like ${qn + '%'} then 60
        when ${nombre} like ${contiene} then 45 else 0 end + 20 * word_similarity(${qn}, ${nombre}))`
    : sql<number>`0`

  const [filas, [total]] = await Promise.all([
    db
      .select()
      .from(negocios)
      .where(where)
      .orderBy(...(qn ? [desc(score)] : []), desc(negocios.verificado), asc(negocios.nombre))
      .limit(f.limite)
      .offset((f.pagina - 1) * f.limite),
    db.select({ n: count() }).from(negocios).where(where),
  ])
  return { filas, total: total!.n }
}

// ---------- Sugerencias y "¿quisiste decir…?" ----------

export type Sugerencia = {
  texto: string
  tipo: 'producto' | 'categoria' | 'negocio'
  slug?: string
}

export async function sugerir(q: string, max = 8): Promise<Sugerencia[]> {
  const qn = normalizar(q)
  if (qn.length < 2) return []

  const puntaje = (col: SQLWrapper) => sql<number>`(
    case when ${nz(col)} like ${qn + '%'} then 3
         when ${nz(col)} like ${'% ' + qn + '%'} then 2
         else word_similarity(${qn}, ${nz(col)}) end)`
  const coincide = (col: SQLWrapper) =>
    or(
      sql`${nz(col)} like ${qn + '%'}`,
      sql`${nz(col)} like ${'% ' + qn + '%'}`,
      sql`word_similarity(${qn}, ${nz(col)}) >= 0.5`,
    )

  const [prods, cats, negs] = await Promise.all([
    db
      .select({ texto: productos.nombre, score: sql<number>`max(${puntaje(productos.nombre)})` })
      .from(productos)
      .innerJoin(negocios, eq(productos.negocioId, negocios.id))
      .where(and(eq(negocios.estado, 'activo'), coincide(productos.nombre)))
      .groupBy(productos.nombre)
      .orderBy(desc(sql`max(${puntaje(productos.nombre)})`))
      .limit(max),
    db
      .select({
        texto: categorias.nombre,
        slug: categorias.slug,
        score: puntaje(categorias.nombre),
      })
      .from(categorias)
      .where(coincide(categorias.nombre))
      .orderBy(desc(puntaje(categorias.nombre)))
      .limit(max),
    db
      .select({ texto: negocios.nombre, slug: negocios.slug, score: puntaje(negocios.nombre) })
      .from(negocios)
      .where(and(eq(negocios.estado, 'activo'), coincide(negocios.nombre)))
      .orderBy(desc(puntaje(negocios.nombre)))
      .limit(max),
  ])

  const todas = [
    ...prods.map((r) => ({ texto: r.texto, tipo: 'producto' as const, score: Number(r.score) })),
    ...cats.map((r) => ({
      texto: r.texto,
      tipo: 'categoria' as const,
      slug: r.slug,
      score: Number(r.score),
    })),
    ...negs.map((r) => ({
      texto: r.texto,
      tipo: 'negocio' as const,
      slug: r.slug,
      score: Number(r.score),
    })),
  ].sort((a, b) => b.score - a.score)

  const vistas = new Set<string>()
  const salida: Sugerencia[] = []
  for (const item of todas) {
    const s: Sugerencia = {
      texto: item.texto,
      tipo: item.tipo,
      slug: 'slug' in item ? item.slug : undefined,
    }
    const clave = `${s.tipo}:${normalizar(s.texto)}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(s)
    if (salida.length === max) break
  }
  return salida
}

// Reemplaza cada palabra desconocida por la palabra más parecida del catálogo
export async function quisisteDecir(q: string): Promise<string | null> {
  const palabras = normalizar(q)
    .split(' ')
    .filter((w) => w.length >= 3)
    .slice(0, 5)
  if (!palabras.length) return null

  const corregidas = await Promise.all(
    palabras.map(async (w) => {
      const filas = await db.execute<{ w: string; s: number }>(sql`
        with vocab as (
          select distinct w from (
            select unnest(regexp_split_to_array(f_unaccent(lower(p.nombre)), '[^a-z0-9]+')) as w
              from productos p join negocios n on n.id = p.negocio_id where n.estado = 'activo'
            union all
            select unnest(regexp_split_to_array(f_unaccent(lower(nombre)), '[^a-z0-9]+')) from negocios where estado = 'activo'
            union all
            select unnest(regexp_split_to_array(f_unaccent(lower(nombre)), '[^a-z0-9]+')) from categorias
          ) t where length(w) >= 3
        )
        select w, similarity(w, ${w}) as s from vocab
        where similarity(w, ${w}) >= 0.25 order by s desc, w limit 1`)
      return filas[0]?.w ?? w
    }),
  )
  const original = palabras.join(' ')
  const corregida = corregidas.join(' ')
  return corregida !== original ? corregida : null
}
