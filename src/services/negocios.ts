import { eq, inArray } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '../db/client.js'
import {
  categorias,
  departamentos,
  distritos,
  negocioCategorias,
  negocios,
  provincias,
} from '../db/schema.js'
import { ApiError } from '../lib/errores.js'
import type { perfilSchema } from '../lib/esquemas.js'
import { snake } from '../lib/respuesta.js'

export async function negocioActual(usuarioId: number) {
  const [n] = await db.select().from(negocios).where(eq(negocios.usuarioId, usuarioId)).limit(1)
  if (!n) throw new ApiError(404, 'negocio_no_encontrado', 'No tienes un negocio registrado')
  return n
}

export function exigirEdicion(negocio: { puedeEditar: boolean }) {
  if (!negocio.puedeEditar) {
    throw new ApiError(403, 'edicion_bloqueada', 'El administrador bloqueó la edición del perfil')
  }
}

// Drizzle envuelve el error de postgres en `cause`
export const codigoPg = (e: unknown): string | undefined => {
  const err = e as { code?: string; cause?: unknown } | null
  return err?.code ?? (err?.cause != null ? codigoPg(err.cause) : undefined)
}

export async function perfilCompleto(negocioId: number) {
  const [n] = await db
    .select({
      negocio: negocios,
      distrito: { id: distritos.id, nombre: distritos.nombre },
      provincia: { id: provincias.id, nombre: provincias.nombre },
      departamento: { id: departamentos.id, nombre: departamentos.nombre },
    })
    .from(negocios)
    .leftJoin(distritos, eq(negocios.distritoId, distritos.id))
    .leftJoin(provincias, eq(distritos.provinciaId, provincias.id))
    .leftJoin(departamentos, eq(provincias.departamentoId, departamentos.id))
    .where(eq(negocios.id, negocioId))
    .limit(1)
  if (!n) throw new ApiError(404, 'negocio_no_encontrado', 'Negocio no encontrado')
  const cats = await db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      slug: categorias.slug,
      tipo: categorias.tipo,
    })
    .from(negocioCategorias)
    .innerJoin(categorias, eq(negocioCategorias.categoriaId, categorias.id))
    .where(eq(negocioCategorias.negocioId, negocioId))
  const datos: Partial<typeof negocios.$inferSelect> = { ...n.negocio }
  delete datos.logoDeleteUrl
  return snake({
    ...datos,
    ubicacion: n.distrito?.id
      ? { distrito: n.distrito, provincia: n.provincia, departamento: n.departamento }
      : null,
    categorias: cats,
  }) as Record<string, unknown>
}

export async function aplicarPerfil(negocioId: number, d: z.infer<typeof perfilSchema>) {
  try {
    await db
      .update(negocios)
      .set({
        nombre: d.nombre,
        descripcion: d.descripcion,
        direccion: d.direccion,
        distritoId: d.distrito_id,
        ruc: d.ruc,
        whatsapp: d.whatsapp,
        facebook: d.facebook,
        instagram: d.instagram,
        tiktok: d.tiktok,
        sitioWeb: d.sitio_web,
        actualizadoEn: new Date(),
      })
      .where(eq(negocios.id, negocioId))
  } catch (e) {
    if (codigoPg(e) === '23503')
      throw new ApiError(400, 'distrito_invalido', 'El distrito no existe')
    throw e
  }
}

export async function asignarCategorias(negocioId: number, idsEntrada: number[]) {
  const ids = [...new Set(idsEntrada)]
  if (ids.length) {
    const existentes = await db
      .select({ id: categorias.id })
      .from(categorias)
      .where(inArray(categorias.id, ids))
    if (existentes.length !== ids.length) {
      throw new ApiError(400, 'categoria_invalida', 'Alguna categoría no existe')
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(negocioCategorias).where(eq(negocioCategorias.negocioId, negocioId))
    if (ids.length) {
      await tx
        .insert(negocioCategorias)
        .values(ids.map((categoriaId) => ({ negocioId, categoriaId })))
    }
    await tx.update(negocios).set({ actualizadoEn: new Date() }).where(eq(negocios.id, negocioId))
  })
}
