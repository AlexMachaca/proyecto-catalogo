import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/imgbb.js', async (original) => ({
  ...(await original<typeof import('../src/services/imgbb.js')>()),
  subirImagen: vi.fn(async () => ({
    url: 'https://i.ibb.co/x/test.png',
    deleteUrl: 'https://ibb.co/x/del',
  })),
}))

import { api, limpiarBase, loginAdmin, PNG, registrarNegocio, subir } from './helpers.js'

let admin: string
beforeAll(async () => {
  await limpiarBase()
  admin = await loginAdmin()
})

describe('perfil del negocio', () => {
  it('valida RUC, WhatsApp y distrito, y normaliza el celular', async () => {
    const n = await registrarNegocio()
    const ok = await api('PATCH', '/mi-negocio', {
      token: n.token,
      json: {
        ruc: '20123456786',
        whatsapp: '987654321',
        distrito_id: '030101',
        instagram: 'https://instagram.com/x',
      },
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ whatsapp: '51987654321', ruc: '20123456786' })
    expect(ok.body.ubicacion.distrito.nombre).toBe('Abancay')

    expect(
      (await api('PATCH', '/mi-negocio', { token: n.token, json: { ruc: '20123456789' } })).status,
    ).toBe(400)
    expect(
      (await api('PATCH', '/mi-negocio', { token: n.token, json: { distrito_id: '039999' } }))
        .status,
    ).toBe(400)
    expect((await api('PATCH', '/mi-negocio', { token: n.token, json: {} })).status).toBe(400)
  })

  it('puede_editar=false bloquea el perfil pero no los productos; el admin sí puede editar', async () => {
    const n = await registrarNegocio()
    const p = await api('POST', '/mi-negocio/productos', {
      token: n.token,
      json: { nombre: 'Item', precio: 5 },
    })
    await api('PATCH', `/admin/negocios/${n.negocioId}/permisos`, {
      token: admin,
      json: { puede_editar: false },
    })

    const bloqueado = await api('PATCH', '/mi-negocio', {
      token: n.token,
      json: { nombre: 'Nuevo nombre' },
    })
    expect(bloqueado.status).toBe(403)
    expect(bloqueado.body.error.codigo).toBe('edicion_bloqueada')
    expect(
      (await api('PUT', '/mi-negocio/categorias', { token: n.token, json: { categoria_ids: [] } }))
        .status,
    ).toBe(403)
    expect((await subir('/mi-negocio/logo', n.token, PNG)).status).toBe(403)

    expect(
      (
        await api('PATCH', `/mi-negocio/productos/${p.body.id}`, {
          token: n.token,
          json: { precio: 6 },
        })
      ).status,
    ).toBe(200)
    const porAdmin = await api('PATCH', `/admin/negocios/${n.negocioId}`, {
      token: admin,
      json: { descripcion: 'Editado por admin' },
    })
    expect(porAdmin.status).toBe(200)
  })

  it('sube logo e imagen de producto (imgbb simulado) y rechaza archivos inválidos', async () => {
    const n = await registrarNegocio()
    const logo = await subir('/mi-negocio/logo', n.token, PNG)
    expect(logo.status).toBe(200)
    expect(logo.body.logo_url).toBe('https://i.ibb.co/x/test.png')

    const p = await api('POST', '/mi-negocio/productos', {
      token: n.token,
      json: { nombre: 'Con foto', precio: 5 },
    })
    const img = await subir(`/mi-negocio/productos/${p.body.id}/imagen`, n.token, PNG)
    expect(img.body.imagen_url).toBe('https://i.ibb.co/x/test.png')

    const texto = await subir(
      '/mi-negocio/logo',
      n.token,
      new TextEncoder().encode('no soy una imagen'),
    )
    expect(texto.status).toBe(415)
    const grande = await subir('/mi-negocio/logo', n.token, new Uint8Array(3 * 1024 * 1024).fill(0))
    expect([413, 415]).toContain(grande.status)
  })
})

describe('productos del negocio', () => {
  it('calcula el precio final y aplica las reglas de stock', async () => {
    const n = await registrarNegocio()
    const t = n.token

    const leche = await api('POST', '/mi-negocio/productos', {
      token: t,
      json: { nombre: 'Leche', precio: 4.5, descuento_pct: 20, stock: 10 },
    })
    expect(leche.status).toBe(201)
    expect(leche.body).toMatchObject({ precio_final: 3.6, disponible: true })

    const agotado = await api('POST', '/mi-negocio/productos', {
      token: t,
      json: { nombre: 'Agotado', precio: 3, stock: 0 },
    })
    expect(agotado.body.disponible).toBe(false)

    const servicio = await api('POST', '/mi-negocio/productos', {
      token: t,
      json: { nombre: 'Corte de cabello', tipo: 'servicio', precio: 15, stock: 5 },
    })
    expect(servicio.body.stock).toBeNull()

    const a0 = await api('PATCH', `/mi-negocio/productos/${leche.body.id}/stock`, {
      token: t,
      json: { stock: 0 },
    })
    expect(a0.body.disponible).toBe(false)
    const a7 = await api('PATCH', `/mi-negocio/productos/${leche.body.id}/stock`, {
      token: t,
      json: { stock: 7 },
    })
    expect(a7.body.disponible).toBe(true)

    expect(
      (
        await api('POST', '/mi-negocio/productos', {
          token: t,
          json: { nombre: 'X', precio: 4.555 },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await api('POST', '/mi-negocio/productos', {
          token: t,
          json: { nombre: 'X', precio: 4, descuento_pct: 150 },
        })
      ).status,
    ).toBe(400)
  })

  it('un negocio no puede ver ni modificar productos de otro', async () => {
    const a = await registrarNegocio('Negocio A')
    const b = await registrarNegocio('Negocio B')
    const p = await api('POST', '/mi-negocio/productos', {
      token: a.token,
      json: { nombre: 'Mío', precio: 5 },
    })
    const id = p.body.id
    expect((await api('GET', `/mi-negocio/productos/${id}`, { token: b.token })).status).toBe(404)
    expect(
      (await api('PATCH', `/mi-negocio/productos/${id}`, { token: b.token, json: { precio: 1 } }))
        .status,
    ).toBe(404)
    expect((await api('DELETE', `/mi-negocio/productos/${id}`, { token: b.token })).status).toBe(
      404,
    )
    expect((await api('DELETE', `/mi-negocio/productos/${id}`, { token: a.token })).status).toBe(
      204,
    )
  })
})
