import { app } from '../src/app.js'
import { sql } from '../src/db/client.js'
import { reiniciarContadores } from '../src/middleware/rate-limit.js'

type Opciones = { token?: string; json?: unknown; headers?: Record<string, string> }

export async function api(metodo: string, ruta: string, op: Opciones = {}) {
  const headers: Record<string, string> = { ...op.headers }
  if (op.token) headers.Authorization = `Bearer ${op.token}`
  if (op.json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await app.request(`/api/v1${ruta}`, {
    method: metodo,
    headers,
    body: op.json !== undefined ? JSON.stringify(op.json) : undefined,
  })
  const texto = await res.text()
  return { status: res.status, body: texto ? JSON.parse(texto) : null, headers: res.headers }
}

export async function subir(ruta: string, token: string, bytes: Uint8Array, nombre = 'a.png') {
  const form = new FormData()
  form.set('imagen', new File([bytes as BlobPart], nombre))
  const res = await app.request(`/api/v1${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  return { status: res.status, body: await res.json() }
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

export async function limpiarBase() {
  await sql`delete from usuarios where rol = 'negocio'`
  await sql`delete from categorias where slug like 'test-%'`
  reiniciarContadores()
}

export async function loginAdmin() {
  const r = await api('POST', '/auth/login', {
    json: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  })
  return r.body.token as string
}

let contador = 0
export async function registrarNegocio(nombre = 'Negocio de prueba') {
  const email = `neg${Date.now()}${contador++}@test.local`
  const r = await api('POST', '/auth/registro', {
    json: { email, password: 'clave12345', nombre_negocio: nombre },
  })
  return {
    email,
    token: r.body.token as string,
    negocioId: r.body.negocio.id as number,
    slug: r.body.negocio.slug as string,
  }
}

// Negocio listo para aparecer en el catálogo público
export async function negocioActivo(
  adminToken: string,
  nombre: string,
  extra: Record<string, unknown> = {},
) {
  const n = await registrarNegocio(nombre)
  await api('PATCH', `/admin/negocios/${n.negocioId}`, {
    token: adminToken,
    json: {
      direccion: 'Av. Prueba 123',
      distrito_id: '030101',
      whatsapp: '987654321',
      ruc: '20123456786',
      ...extra,
    },
  })
  await api('POST', `/admin/negocios/${n.negocioId}/verificar`, { token: adminToken })
  return n
}
