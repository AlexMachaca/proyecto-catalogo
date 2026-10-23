import { z, type ZodType } from 'zod'
import { categoriasAsignadasSchema, perfilSchema } from '../lib/esquemas.js'
import { googleSchema, loginSchema, registroSchema } from '../routes/auth.js'
import {
  crearSchema as crearCategoria,
  editarSchema as editarCategoria,
} from '../routes/admin/categorias.js'
import {
  crearSchema as crearProducto,
  editarSchema as editarProducto,
  stockSchema,
} from '../routes/negocio/productos.js'

type Acceso = 'publico' | 'negocio' | 'admin' | 'sesion'
type Param = [nombre: string, descripcion: string, tipo?: 'integer' | 'boolean' | 'string']

type Ruta = {
  metodo: 'get' | 'post' | 'put' | 'patch' | 'delete'
  ruta: string
  tag: string
  resumen: string
  acceso?: Acceso
  body?: ZodType
  /** El cuerpo es multipart/form-data con un archivo en el campo `imagen` */
  imagen?: boolean
  query?: Param[]
  exito?: number
}

const PAGINACION: Param[] = [
  ['pagina', 'Número de página (desde 1)', 'integer'],
  ['limite', 'Resultados por página (máx. 50)', 'integer'],
]
const FILTROS: Param[] = [
  ['q', 'Texto a buscar (tolera tildes, mayúsculas y errores de tipeo)'],
  ['categoria', 'Slug de la categoría (ver GET /categorias)'],
  ['distrito', 'Código UBIGEO del distrito (6 dígitos)'],
  ['provincia', 'Código UBIGEO de la provincia (4 dígitos)'],
  ['tipo', 'producto | servicio'],
  ['solo_disponibles', 'true para ocultar los no disponibles', 'boolean'],
  ['orden', 'relevancia | recientes | precio_asc | precio_desc | descuento'],
]

const RUTAS: Ruta[] = [
  // Auth
  {
    metodo: 'post',
    ruta: '/auth/registro',
    tag: 'Auth',
    resumen: 'Registrar un negocio (correo y contraseña). Queda pendiente de verificación',
    body: registroSchema,
    exito: 201,
  },
  {
    metodo: 'post',
    ruta: '/auth/login',
    tag: 'Auth',
    resumen: 'Iniciar sesión (negocio o administrador)',
    body: loginSchema,
  },
  {
    metodo: 'post',
    ruta: '/auth/google',
    tag: 'Auth',
    resumen: 'Iniciar sesión o registrarse con un id_token de Google',
    body: googleSchema,
  },
  {
    metodo: 'get',
    ruta: '/auth/me',
    tag: 'Auth',
    resumen: 'Usuario y negocio de la sesión actual',
    acceso: 'sesion',
  },

  // Público
  {
    metodo: 'get',
    ruta: '/buscar',
    tag: 'Buscador',
    resumen: 'Buscador tolerante de productos/servicios y negocios',
    query: [
      ...FILTROS,
      ...PAGINACION,
      ['limite_negocios', 'Negocios a devolver (0-20, por defecto 5)', 'integer'],
    ],
  },
  {
    metodo: 'get',
    ruta: '/buscar/sugerencias',
    tag: 'Buscador',
    resumen: 'Autocompletado de productos, categorías y negocios',
    query: [['q', 'Texto parcial (mín. 2 caracteres)']],
  },
  {
    metodo: 'get',
    ruta: '/ofertas',
    tag: 'Catálogo',
    resumen: 'Productos con descuento de negocios activos',
    query: [
      ...FILTROS.filter(([n]) => ['categoria', 'distrito', 'provincia', 'tipo'].includes(n)),
      ...PAGINACION,
    ],
  },
  {
    metodo: 'get',
    ruta: '/productos',
    tag: 'Catálogo',
    resumen: 'Listar y filtrar productos y servicios',
    query: [...FILTROS, ...PAGINACION],
  },
  {
    metodo: 'get',
    ruta: '/productos/{id}',
    tag: 'Catálogo',
    resumen: 'Detalle de un producto con los datos de su negocio',
  },
  {
    metodo: 'get',
    ruta: '/productos/{id}/whatsapp',
    tag: 'Catálogo',
    resumen: 'Enlace wa.me con el pedido prellenado',
    query: [['cantidad', 'Unidades (1-99, por defecto 1)', 'integer']],
  },
  {
    metodo: 'get',
    ruta: '/negocios',
    tag: 'Catálogo',
    resumen: 'Listar negocios activos',
    query: [
      ...FILTROS.filter(([n]) => ['q', 'categoria', 'distrito', 'provincia'].includes(n)),
      ...PAGINACION,
    ],
  },
  { metodo: 'get', ruta: '/negocios/{slug}', tag: 'Catálogo', resumen: 'Página de la tienda' },
  {
    metodo: 'get',
    ruta: '/negocios/{slug}/productos',
    tag: 'Catálogo',
    resumen: 'Productos de una tienda',
    query: [
      ...FILTROS.filter(([n]) =>
        ['q', 'categoria', 'tipo', 'solo_disponibles', 'orden'].includes(n),
      ),
      ...PAGINACION,
    ],
  },
  {
    metodo: 'get',
    ruta: '/categorias',
    tag: 'Catálogo',
    resumen: 'Categorías y servicios, con total de negocios activos',
  },
  {
    metodo: 'get',
    ruta: '/ubicaciones/departamentos',
    tag: 'Ubicaciones',
    resumen: 'Departamentos',
  },
  {
    metodo: 'get',
    ruta: '/ubicaciones/provincias',
    tag: 'Ubicaciones',
    resumen: 'Provincias',
    query: [['departamento_id', 'Código UBIGEO (2 dígitos)']],
  },
  {
    metodo: 'get',
    ruta: '/ubicaciones/distritos',
    tag: 'Ubicaciones',
    resumen: 'Distritos',
    query: [['provincia_id', 'Código UBIGEO (4 dígitos)']],
  },

  // Negocio
  {
    metodo: 'get',
    ruta: '/mi-negocio',
    tag: 'Mi negocio',
    resumen: 'Ver mi perfil',
    acceso: 'negocio',
  },
  {
    metodo: 'patch',
    ruta: '/mi-negocio',
    tag: 'Mi negocio',
    resumen: 'Editar mi perfil (bloqueado si el admin quitó el permiso)',
    acceso: 'negocio',
    body: perfilSchema,
  },
  {
    metodo: 'put',
    ruta: '/mi-negocio/categorias',
    tag: 'Mi negocio',
    resumen: 'Reemplazar mis categorías (máx. 5)',
    acceso: 'negocio',
    body: categoriasAsignadasSchema,
  },
  {
    metodo: 'post',
    ruta: '/mi-negocio/logo',
    tag: 'Mi negocio',
    resumen: 'Subir el logo (JPG/PNG/WEBP, máx. 2 MB)',
    acceso: 'negocio',
    imagen: true,
  },
  {
    metodo: 'get',
    ruta: '/mi-negocio/productos',
    tag: 'Mis productos',
    resumen: 'Listar mis productos',
    acceso: 'negocio',
    query: [
      ['categoria_id', 'Filtrar por categoría', 'integer'],
      ['disponible', 'true | false', 'boolean'],
      ...PAGINACION,
    ],
  },
  {
    metodo: 'post',
    ruta: '/mi-negocio/productos',
    tag: 'Mis productos',
    resumen: 'Crear un producto o servicio',
    acceso: 'negocio',
    body: crearProducto,
    exito: 201,
  },
  {
    metodo: 'get',
    ruta: '/mi-negocio/productos/{id}',
    tag: 'Mis productos',
    resumen: 'Ver un producto mío',
    acceso: 'negocio',
  },
  {
    metodo: 'patch',
    ruta: '/mi-negocio/productos/{id}',
    tag: 'Mis productos',
    resumen: 'Editar precio, descuento, stock, estado, etc.',
    acceso: 'negocio',
    body: editarProducto,
  },
  {
    metodo: 'patch',
    ruta: '/mi-negocio/productos/{id}/stock',
    tag: 'Mis productos',
    resumen: 'Actualizar rápido stock y/o disponibilidad',
    acceso: 'negocio',
    body: stockSchema,
  },
  {
    metodo: 'post',
    ruta: '/mi-negocio/productos/{id}/imagen',
    tag: 'Mis productos',
    resumen: 'Subir la imagen del producto',
    acceso: 'negocio',
    imagen: true,
  },
  {
    metodo: 'delete',
    ruta: '/mi-negocio/productos/{id}',
    tag: 'Mis productos',
    resumen: 'Eliminar un producto',
    acceso: 'negocio',
    exito: 204,
  },

  // Admin
  {
    metodo: 'get',
    ruta: '/admin/negocios',
    tag: 'Admin · Negocios',
    resumen: 'Listar negocios',
    acceso: 'admin',
    query: [
      ['estado', 'pendiente | activo | suspendido'],
      ['verificado', 'true | false', 'boolean'],
      ['distrito_id', 'UBIGEO (6 dígitos)'],
      ['q', 'Nombre, correo o RUC'],
      ...PAGINACION,
    ],
  },
  {
    metodo: 'get',
    ruta: '/admin/negocios/{id}',
    tag: 'Admin · Negocios',
    resumen: 'Detalle de un negocio',
    acceso: 'admin',
  },
  {
    metodo: 'patch',
    ruta: '/admin/negocios/{id}',
    tag: 'Admin · Negocios',
    resumen: 'Editar datos de cualquier negocio',
    acceso: 'admin',
    body: perfilSchema,
  },
  {
    metodo: 'put',
    ruta: '/admin/negocios/{id}/categorias',
    tag: 'Admin · Negocios',
    resumen: 'Asignar categorías a un negocio',
    acceso: 'admin',
    body: categoriasAsignadasSchema,
  },
  {
    metodo: 'post',
    ruta: '/admin/negocios/{id}/verificar',
    tag: 'Admin · Negocios',
    resumen:
      'Verificar: pasa a activo y se muestra al público (exige whatsapp, distrito, dirección y RUC)',
    acceso: 'admin',
  },
  {
    metodo: 'post',
    ruta: '/admin/negocios/{id}/baja',
    tag: 'Admin · Negocios',
    resumen: 'Dar de baja (suspendido, deja de ser público)',
    acceso: 'admin',
  },
  {
    metodo: 'post',
    ruta: '/admin/negocios/{id}/reactivar',
    tag: 'Admin · Negocios',
    resumen: 'Reactivar un negocio suspendido',
    acceso: 'admin',
  },
  {
    metodo: 'patch',
    ruta: '/admin/negocios/{id}/permisos',
    tag: 'Admin · Negocios',
    resumen: 'Permitir o bloquear la edición del perfil por el negocio',
    acceso: 'admin',
    body: z.object({ puede_editar: z.boolean() }),
  },
  {
    metodo: 'get',
    ruta: '/admin/categorias',
    tag: 'Admin · Categorías',
    resumen: 'Listar categorías con su uso',
    acceso: 'admin',
  },
  {
    metodo: 'post',
    ruta: '/admin/categorias',
    tag: 'Admin · Categorías',
    resumen: 'Crear categoría',
    acceso: 'admin',
    body: crearCategoria,
    exito: 201,
  },
  {
    metodo: 'patch',
    ruta: '/admin/categorias/{id}',
    tag: 'Admin · Categorías',
    resumen: 'Editar categoría',
    acceso: 'admin',
    body: editarCategoria,
  },
  {
    metodo: 'delete',
    ruta: '/admin/categorias/{id}',
    tag: 'Admin · Categorías',
    resumen: 'Eliminar categoría (solo si no está en uso)',
    acceso: 'admin',
    exito: 204,
  },
]

const esquemaJson = (s: ZodType) => {
  const json = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
  delete json.$schema
  return json
}

const refError = { $ref: '#/components/schemas/Error' }
const respuestaError = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: refError } },
})

function operacion(r: Ruta) {
  const acceso = r.acceso ?? 'publico'
  const parametros = [
    ...[...r.ruta.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1]!,
      in: 'path',
      required: true,
      schema: { type: m[1] === 'slug' ? 'string' : 'integer' },
    })),
    ...(r.query ?? []).map(([name, description, tipo]) => ({
      name,
      in: 'query',
      description,
      schema: { type: tipo ?? 'string' },
    })),
  ]

  const respuestas: Record<string, unknown> = {
    [r.exito ?? 200]: { description: r.exito === 204 ? 'Sin contenido' : 'OK' },
    400: respuestaError('Datos inválidos'),
  }
  if (acceso !== 'publico') {
    respuestas['401'] = respuestaError('Falta el token o es inválido')
    if (acceso !== 'sesion') respuestas['403'] = respuestaError('No tienes permiso')
  }
  if (r.ruta.includes('{')) respuestas['404'] = respuestaError('No encontrado')

  return {
    tags: [r.tag],
    summary: r.resumen,
    ...(acceso !== 'publico' ? { security: [{ bearer: [] }] } : {}),
    ...(parametros.length ? { parameters: parametros } : {}),
    ...(r.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: esquemaJson(r.body) } },
          },
        }
      : {}),
    ...(r.imagen
      ? {
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['imagen'],
                  properties: {
                    imagen: {
                      type: 'string',
                      format: 'binary',
                      description: 'JPG, PNG o WEBP, máx. 2 MB',
                    },
                  },
                },
              },
            },
          },
        }
      : {}),
    responses: respuestas,
  }
}

export function construirOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of RUTAS) (paths[r.ruta] ??= {})[r.metodo] = operacion(r)

  return {
    openapi: '3.1.0',
    info: {
      title: 'API Catálogo de negocios locales',
      version: '0.1.0',
      description:
        'Backend del catálogo de negocios locales de Apurímac. Las rutas públicas no requieren sesión; ' +
        'las de negocio y administrador usan `Authorization: Bearer <token>` (se obtiene en /auth/login). ' +
        'Entradas y salidas usan snake_case. Errores: `{ "error": { "codigo", "mensaje" } }`.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [...new Set(RUTAS.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { codigo: { type: 'string' }, mensaje: { type: 'string' } },
            },
          },
        },
      },
    },
  }
}
