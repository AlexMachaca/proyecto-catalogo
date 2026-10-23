import { beforeAll, describe, expect, it } from 'vitest'
import { api, limpiarBase, loginAdmin, negocioActivo, registrarNegocio } from './helpers.js'

type Prod = { id: number; nombre: string; disponible: boolean }
let admin: string
let bodega: Awaited<ReturnType<typeof negocioActivo>>
let ferreteria: Awaited<ReturnType<typeof negocioActivo>>

const buscar = async (q: string) => {
  const r = await api('GET', `/buscar?q=${encodeURIComponent(q)}`)
  return { ...r, nombres: (r.body.productos?.datos ?? []).map((p: Prod) => p.nombre) as string[] }
}
const crear = (token: string, json: Record<string, unknown>) =>
  api('POST', '/mi-negocio/productos', { token, json })

beforeAll(async () => {
  await limpiarBase()
  admin = await loginAdmin()
  bodega = await negocioActivo(admin, 'Bodega Ñandú')
  ferreteria = await negocioActivo(admin, 'Ferretería Andina', { distrito_id: '030109' })

  await crear(bodega.token, {
    nombre: 'Leche Gloria Lata 400g',
    precio: 4.5,
    descuento_pct: 20,
    stock: 10,
  })
  await crear(bodega.token, { nombre: 'Zapatillas deportivas', precio: 89.9, stock: 5 })
  await crear(bodega.token, {
    nombre: 'Camión de juguete',
    precio: 25,
    descuento_pct: 10,
    stock: 3,
  })
  await crear(bodega.token, { nombre: 'Piña golden', precio: 6, stock: 0 })
  await crear(bodega.token, { nombre: 'Pollo a la brasa', precio: 18 })
  await crear(ferreteria.token, {
    nombre: 'Cemento Sol 42.5kg',
    precio: 32,
    descuento_pct: 5,
    stock: 100,
  })
  await crear(ferreteria.token, {
    nombre: 'Instalación eléctrica',
    tipo: 'servicio',
    precio: 80,
    descuento_pct: 15,
  })
})

describe('buscador tolerante', () => {
  it.each([
    ['camion', 'Camión de juguete'],
    ['LECHE', 'Leche Gloria Lata 400g'],
    ['pina', 'Piña golden'],
    ['zapatiyas', 'Zapatillas deportivas'],
    ['cemnto', 'Cemento Sol 42.5kg'],
    ['gloria leche', 'Leche Gloria Lata 400g'],
    ['pollos', 'Pollo a la brasa'],
    ['instalacion electrica', 'Instalación eléctrica'],
  ])('"%s" encuentra "%s"', async (q, esperado) => {
    const r = await buscar(q)
    expect(r.status).toBe(200)
    expect(r.nombres).toContain(esperado)
  })

  it('encuentra por prefijo y por nombre de negocio', async () => {
    expect(
      (await buscar('ferret')).body.negocios.datos.map((n: { nombre: string }) => n.nombre),
    ).toContain('Ferretería Andina')
    expect((await buscar('bodega')).nombres).toContain('Pollo a la brasa')
  })

  it('no devuelve ruido ni falla con símbolos o inyección', async () => {
    expect((await buscar('xyzq')).nombres).toEqual([])
    expect((await buscar('%%')).nombres).toEqual([])
    expect((await buscar("'; drop table productos;--")).status).toBe(200)
    expect((await api('GET', '/buscar?q=a')).status).toBe(400)
  })

  it('sugiere una corrección cuando no hay resultados', async () => {
    const r = await buscar('lecxe glorya')
    expect(r.nombres).toEqual([])
    expect(r.body.sugerencia).toBe('leche gloria')
  })

  it('autocompleta productos, categorías y negocios', async () => {
    const zap = await api('GET', '/buscar/sugerencias?q=zap')
    expect(zap.body.sugerencias[0]).toMatchObject({
      texto: 'Zapatillas deportivas',
      tipo: 'producto',
    })
    const ferr = await api('GET', '/buscar/sugerencias?q=ferr')
    expect(ferr.body.sugerencias.map((s: { tipo: string }) => s.tipo)).toEqual(
      expect.arrayContaining(['negocio']),
    )
    expect((await api('GET', '/buscar/sugerencias?q=l')).body.sugerencias).toEqual([])
  })

  it('pone los no disponibles al final', async () => {
    const r = await api('GET', '/productos?distrito=030101')
    const flags = r.body.datos.map((p: Prod) => p.disponible)
    expect(flags.lastIndexOf(true)).toBeLessThan(flags.indexOf(false))
  })
})

describe('catálogo público', () => {
  it('lista ofertas ordenadas por descuento y las filtra por distrito', async () => {
    const todas = await api('GET', '/ofertas')
    const descuentos = todas.body.datos.map((p: { descuento_pct: number }) => p.descuento_pct)
    expect(descuentos).toEqual([...descuentos].sort((a, b) => b - a))
    expect(descuentos.every((d: number) => d > 0)).toBe(true)

    const tamburco = await api('GET', '/ofertas?distrito=030109')
    expect(tamburco.body.datos.map((p: Prod) => p.nombre).sort()).toEqual([
      'Cemento Sol 42.5kg',
      'Instalación eléctrica',
    ])
  })

  it('filtra por tipo, orden y paginación', async () => {
    const serv = await api('GET', '/productos?tipo=servicio')
    expect(serv.body.datos.map((p: Prod) => p.nombre)).toEqual(['Instalación eléctrica'])
    const caro = await api('GET', '/productos?orden=precio_desc&limite=1')
    expect(caro.body.datos[0].nombre).toBe('Zapatillas deportivas')
    expect(caro.body.total).toBeGreaterThan(1)
  })

  it('muestra la tienda con sus productos y datos de contacto', async () => {
    const t = await api('GET', `/negocios/${bodega.slug}`)
    expect(t.body).toMatchObject({
      nombre: 'Bodega Ñandú',
      verificado: true,
      whatsapp: '51987654321',
    })
    expect(t.body).not.toHaveProperty('usuario_id')
    expect(t.body.total_productos).toBe(5)
    const prods = await api('GET', `/negocios/${bodega.slug}/productos?q=leche`)
    expect(prods.body.datos).toHaveLength(1)
  })

  it('el filtro por categoría incluye productos de negocios con esa categoría', async () => {
    const cats = await api('GET', '/categorias')
    const ferr = cats.body.find((c: { slug: string }) => c.slug === 'ferreteria-y-construccion')
    await api('PUT', '/mi-negocio/categorias', {
      token: ferreteria.token,
      json: { categoria_ids: [ferr.id] },
    })
    const r = await api('GET', '/productos?categoria=ferreteria-y-construccion')
    expect(r.body.datos.map((p: Prod) => p.nombre).sort()).toEqual([
      'Cemento Sol 42.5kg',
      'Instalación eléctrica',
    ])
    expect(
      (await api('GET', '/categorias')).body.find((c: { slug: string }) => c.slug === ferr.slug)
        .total_negocios,
    ).toBe(1)
  })

  it('genera el enlace de WhatsApp con el pedido', async () => {
    const lista = await api('GET', '/productos?q=leche')
    const id = lista.body.datos[0].id
    const w = await api('GET', `/productos/${id}/whatsapp?cantidad=3`)
    expect(w.body.numero).toBe('51987654321')
    expect(w.body.url).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/)
    expect(w.body.mensaje).toContain('Leche Gloria')
    expect(w.body.mensaje).toContain('3 unidades')
    expect(w.body.mensaje).toContain('S/ 3.60')
  })

  it('devuelve el detalle del producto con el negocio', async () => {
    const id = (await api('GET', '/productos?q=zapatillas')).body.datos[0].id
    const d = await api('GET', `/productos/${id}`)
    expect(d.body.negocio.ubicacion.distrito.nombre).toBe('Abancay')
  })
})

describe('visibilidad', () => {
  it('los negocios pendientes y suspendidos no aparecen en ninguna ruta pública', async () => {
    const oculto = await registrarNegocio('Tienda Oculta Secreta')
    const p = await crear(oculto.token, {
      nombre: 'Producto invisible',
      precio: 10,
      descuento_pct: 50,
    })

    expect((await buscar('invisible')).nombres).toEqual([])
    expect((await api('GET', '/ofertas')).body.datos.map((x: Prod) => x.nombre)).not.toContain(
      'Producto invisible',
    )
    expect((await api('GET', `/negocios/${oculto.slug}`)).status).toBe(404)
    expect((await api('GET', `/productos/${p.body.id}`)).status).toBe(404)
    expect((await api('GET', `/productos/${p.body.id}/whatsapp`)).status).toBe(404)

    // una baja oculta un negocio que antes era público
    await api('POST', `/admin/negocios/${ferreteria.negocioId}/baja`, { token: admin })
    expect((await buscar('cemento')).nombres).toEqual([])
    expect((await api('GET', `/negocios/${ferreteria.slug}`)).status).toBe(404)
    await api('POST', `/admin/negocios/${ferreteria.negocioId}/reactivar`, { token: admin })
    expect((await buscar('cemento')).nombres).toContain('Cemento Sol 42.5kg')
  })

  it('expone ubicaciones y la documentación', async () => {
    expect((await api('GET', '/ubicaciones/distritos?provincia_id=0301')).body).toHaveLength(9)
    const { app } = await import('../src/app.js')
    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).length).toBeGreaterThan(30)
  })
})
