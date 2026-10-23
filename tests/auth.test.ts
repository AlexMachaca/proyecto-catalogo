import { beforeAll, describe, expect, it } from 'vitest'
import { api, limpiarBase, loginAdmin, registrarNegocio } from './helpers.js'

beforeAll(limpiarBase)

describe('autenticación', () => {
  it('registra un negocio pendiente y permite iniciar sesión', async () => {
    const reg = await api('POST', '/auth/registro', {
      json: {
        email: 'Dueno@Test.local',
        password: 'clave12345',
        nombre_negocio: 'Bodega Ñandú',
        whatsapp: '+51 987 654 321',
      },
    })
    expect(reg.status).toBe(201)
    expect(reg.body.negocio).toMatchObject({ slug: 'bodega-nandu', estado: 'pendiente' })

    const login = await api('POST', '/auth/login', {
      json: { email: 'dueno@test.local', password: 'clave12345' },
    })
    expect(login.status).toBe(200)

    const me = await api('GET', '/auth/me', { token: login.body.token })
    expect(me.body.usuario).toMatchObject({ email: 'dueno@test.local', rol: 'negocio' })
    expect(me.body.negocio).toMatchObject({
      estado: 'pendiente',
      verificado: false,
      puede_editar: true,
    })
  })

  it('rechaza correo duplicado, contraseña mala y datos inválidos', async () => {
    expect(
      (
        await api('POST', '/auth/registro', {
          json: { email: 'dueno@test.local', password: 'clave12345', nombre_negocio: 'Otro' },
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await api('POST', '/auth/login', {
          json: { email: 'dueno@test.local', password: 'incorrecta' },
        })
      ).status,
    ).toBe(401)
    const inv = await api('POST', '/auth/registro', {
      json: { email: 'x', password: '1', nombre_negocio: 'A' },
    })
    expect(inv.status).toBe(400)
    expect(inv.body.error.codigo).toBe('validacion')
  })

  it('exige token válido', async () => {
    expect((await api('GET', '/auth/me')).status).toBe(401)
    expect((await api('GET', '/auth/me', { token: 'abc.def.ghi' })).status).toBe(401)
  })

  it('inicia sesión como administrador', async () => {
    const token = await loginAdmin()
    const me = await api('GET', '/auth/me', { token })
    expect(me.body.usuario.rol).toBe('admin')
  })

  it('el acceso con Google responde 503 si no está configurado', async () => {
    const r = await api('POST', '/auth/google', { json: { id_token: 'token-cualquiera-largo' } })
    expect(r.status).toBe(503)
  })

  it('aplica rate limiting al login', async () => {
    let ultimo = 0
    for (let i = 0; i < 12; i++) {
      const r = await api('POST', '/auth/login', {
        json: { email: 'nadie@test.local', password: 'mala' },
        headers: { 'x-test-rate-limit': 'on' },
      })
      ultimo = r.status
    }
    expect(ultimo).toBe(429)
  })
})

describe('permisos por rol', () => {
  it('un negocio no accede a /admin y el admin no accede a /mi-negocio', async () => {
    const n = await registrarNegocio()
    const admin = await loginAdmin()
    expect((await api('GET', '/admin/negocios', { token: n.token })).status).toBe(403)
    expect((await api('GET', '/admin/negocios')).status).toBe(401)
    expect((await api('GET', '/mi-negocio', { token: admin })).status).toBe(403)
  })
})
