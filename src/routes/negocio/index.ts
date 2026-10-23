import { Hono } from 'hono'
import { requiereAuth, requiereRol, type AuthEnv } from '../../middleware/auth.js'
import { perfil } from './perfil.js'
import { misProductos } from './productos.js'

export const miNegocio = new Hono<AuthEnv>()

miNegocio.use(requiereAuth, requiereRol('negocio'))
miNegocio.route('/productos', misProductos)
miNegocio.route('/', perfil)
