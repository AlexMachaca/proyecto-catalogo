import { env } from '../config/env.js'
import { precioFinal } from './productos.js'

export function enlaceWhatsapp(datos: {
  numero: string
  negocio: string
  producto: {
    id: number
    nombre: string
    tipo: 'producto' | 'servicio'
    precio: number
    descuentoPct: number
  }
  cantidad: number
}) {
  const { producto, cantidad } = datos
  const unitario = precioFinal(producto.precio, producto.descuentoPct)
  const lineas = [
    `Hola ${datos.negocio}, vi en el catálogo *${producto.nombre}* a S/ ${unitario.toFixed(2)}` +
      (producto.descuentoPct > 0 ? ` (${producto.descuentoPct}% de descuento)` : '') +
      `.`,
    producto.tipo === 'servicio'
      ? 'Quisiera solicitar este servicio.'
      : `Quisiera pedir ${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}.`,
    `${env.FRONTEND_URL}/productos/${producto.id}`,
  ]
  const mensaje = lineas.join('\n')
  return {
    numero: datos.numero,
    mensaje,
    url: `https://wa.me/${datos.numero}?text=${encodeURIComponent(mensaje)}`,
  }
}
