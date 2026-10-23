import { beforeAll, describe, expect, it } from 'vitest'
import { api, limpiarBase, loginAdmin, registrarNegocio } from './helpers.js'

let admin: string
beforeAll(async () => {
  await limpiarBase()
  admin = await loginAdmin()
})

describe('administración de negocios', () => {
  it('verificar exige datos mínimos, luego activa; baja y reactivar cambian el estado', async () => {
    const n = await registrarNegocio('Panadería Test')
    const incompleto = await api('POST', `/admin/negocios/${n.negocioId}/verificar`, {
      token: admin,
    })
    expect(incompleto.status).toBe(409)
    expect(incompleto.body.error.faltantes).toEqual(expect.arrayContaining(['whatsapp', 'ruc']))

    await api('PATCH', `/admin/negocios/${n.negocioId}`, {
      token: admin,
      json: {
        direccion: 'Jr. Test 1',
        distrito_id: '030101',
        whatsapp: '987654321',
        ruc: '20123456786',
      },
    })
    const ok = await api('POST', `/admin/negocios/${n.negocioId}/verificar`, { token: admin })
    expect(ok.body).toMatchObject({ estado: 'activo', verificado: true })

    expect(
      (await api('POST', `/admin/negocios/${n.negocioId}/baja`, { token: admin })).body.estado,
    ).toBe('suspendido')
    expect(
      (await api('POST', `/admin/negocios/${n.negocioId}/reactivar`, { token: admin })).body.estado,
    ).toBe('activo')
  })

  it('no reactiva un negocio que nunca fue verificado', async () => {
    const n = await registrarNegocio()
    expect(
      (await api('POST', `/admin/negocios/${n.negocioId}/reactivar`, { token: admin })).status,
    ).toBe(409)
  })

  it('lista con filtros y búsqueda segura con símbolos', async () => {
    await registrarNegocio('Ferretería 100% Sol')
    const lista = await api('GET', '/admin/negocios?estado=pendiente&q=100%25', { token: admin })
    expect(lista.status).toBe(200)
    expect(lista.body.datos.some((x: { nombre: string }) => x.nombre.includes('100%'))).toBe(true)
    expect((await api('GET', '/admin/negocios?estado=raro', { token: admin })).status).toBe(400)
  })
})

describe('administración de categorías', () => {
  it('crea, rechaza duplicados, edita y no borra categorías en uso', async () => {
    const c = await api('POST', '/admin/categorias', {
      token: admin,
      json: { nombre: 'Test Panadería' },
    })
    expect(c.status).toBe(201)
    // el slug de las categorías de prueba empieza con "test-"
    expect(c.body.slug).toBe('test-panaderia')
    expect(
      (await api('POST', '/admin/categorias', { token: admin, json: { nombre: 'test panadería' } }))
        .status,
    ).toBe(409)
    expect(
      (
        await api('PATCH', `/admin/categorias/${c.body.id}`, {
          token: admin,
          json: { icono: 'bread' },
        })
      ).body.icono,
    ).toBe('bread')

    const n = await registrarNegocio()
    await api('PUT', '/mi-negocio/categorias', {
      token: n.token,
      json: { categoria_ids: [c.body.id] },
    })
    const enUso = await api('DELETE', `/admin/categorias/${c.body.id}`, { token: admin })
    expect(enUso.status).toBe(409)
    expect(enUso.body.error.codigo).toBe('categoria_en_uso')

    await api('PUT', '/mi-negocio/categorias', { token: n.token, json: { categoria_ids: [] } })
    expect((await api('DELETE', `/admin/categorias/${c.body.id}`, { token: admin })).status).toBe(
      204,
    )
  })
})
