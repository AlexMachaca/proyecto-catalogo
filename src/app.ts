import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { env } from './config/env.js'
import { Scalar } from '@scalar/hono-api-reference'
import { construirOpenApi } from './docs/openapi.js'
import { admin } from './routes/admin/index.js'
import { publico } from './routes/publico/index.js'
import { auth } from './routes/auth.js'
import { miNegocio } from './routes/negocio/index.js'
import { manejarError, noEncontrado } from './middleware/errores.js'

export const app = new Hono()

app.use(secureHeaders())
if (env.NODE_ENV !== 'test') app.use(logger())
app.use('/api/*', cors({ origin: env.FRONTEND_URL, credentials: true }))

app.get('/health', (c) => c.json({ ok: true, hora: new Date().toISOString() }))

const openapi = construirOpenApi()
app.get('/openapi.json', (c) => c.json(openapi))
app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'API Catálogo' }))

const api = new Hono()
api.route('/auth', auth)
api.route('/mi-negocio', miNegocio)
api.route('/admin', admin)
api.route('/', publico)
app.route('/api/v1', api)

app.onError(manejarError)
app.notFound(noEncontrado)
