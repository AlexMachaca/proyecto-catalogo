import { Hono } from 'hono'
import { requiereAuth, requiereRol, type AuthEnv } from '../../middleware/auth.js'
import { adminCategorias } from './categorias.js'
import { adminNegocios } from './negocios.js'

export const admin = new Hono<AuthEnv>()

admin.use(requiereAuth, requiereRol('admin'))
admin.route('/negocios', adminNegocios)
admin.route('/categorias', adminCategorias)
