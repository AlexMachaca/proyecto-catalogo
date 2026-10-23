import { Hono } from 'hono'
import { buscar } from './buscar.js'
import { categoriasPublicas } from './categorias.js'
import { negociosRutas } from './negocios.js'
import { productosPublicos } from './productos.js'
import { ubicaciones } from './ubicaciones.js'

export const publico = new Hono()

publico.route('/ubicaciones', ubicaciones)
publico.route('/', categoriasPublicas)
publico.route('/', productosPublicos)
publico.route('/', negociosRutas)
publico.route('/', buscar)
