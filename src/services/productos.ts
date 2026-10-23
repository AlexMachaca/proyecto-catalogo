import type { productos } from '../db/schema.js'

type Producto = typeof productos.$inferSelect

// Precio con descuento, redondeado a céntimos
export const precioFinal = (precio: number, descuentoPct: number) =>
  Math.round((precio * 100 * (100 - descuentoPct)) / 100) / 100

// Forma pública de un producto (sin las URLs de borrado de imgbb)
export function productoDTO(p: Producto) {
  const precio = Number(p.precio)
  return {
    id: p.id,
    negocio_id: p.negocioId,
    categoria_id: p.categoriaId,
    tipo: p.tipo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    imagen_url: p.imagenUrl,
    precio,
    descuento_pct: p.descuentoPct,
    precio_final: precioFinal(precio, p.descuentoPct),
    stock: p.stock,
    disponible: p.disponible,
    creado_en: p.creadoEn.toISOString(),
    actualizado_en: p.actualizadoEn.toISOString(),
  }
}
