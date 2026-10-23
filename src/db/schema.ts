import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

export const rolEnum = pgEnum('rol', ['negocio', 'admin'])
export const estadoNegocioEnum = pgEnum('estado_negocio', ['pendiente', 'activo', 'suspendido'])
export const tipoItemEnum = pgEnum('tipo_item', ['producto', 'servicio'])

// Ubicación: el id es el código UBIGEO del INEI
export const departamentos = pgTable('departamentos', {
  id: char('id', { length: 2 }).primaryKey(),
  nombre: varchar('nombre', { length: 80 }).notNull(),
})

export const provincias = pgTable('provincias', {
  id: char('id', { length: 4 }).primaryKey(),
  departamentoId: char('departamento_id', { length: 2 })
    .notNull()
    .references(() => departamentos.id),
  nombre: varchar('nombre', { length: 80 }).notNull(),
})

export const distritos = pgTable('distritos', {
  id: char('id', { length: 6 }).primaryKey(),
  provinciaId: char('provincia_id', { length: 4 })
    .notNull()
    .references(() => provincias.id),
  nombre: varchar('nombre', { length: 80 }).notNull(),
})

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'), // NULL si solo usa Google
  googleId: varchar('google_id', { length: 64 }).unique(),
  rol: rolEnum('rol').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
})

export const negocios = pgTable(
  'negocios',
  {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id')
      .notNull()
      .unique()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    nombre: varchar('nombre', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull().unique(),
    descripcion: text('descripcion'),
    logoUrl: text('logo_url'),
    logoDeleteUrl: text('logo_delete_url'),
    direccion: varchar('direccion', { length: 255 }),
    distritoId: char('distrito_id', { length: 6 }).references(() => distritos.id),
    ruc: varchar('ruc', { length: 11 }),
    whatsapp: varchar('whatsapp', { length: 15 }), // formato 519XXXXXXXX
    facebook: varchar('facebook', { length: 255 }),
    instagram: varchar('instagram', { length: 255 }),
    tiktok: varchar('tiktok', { length: 255 }),
    sitioWeb: varchar('sitio_web', { length: 255 }),
    estado: estadoNegocioEnum('estado').notNull().default('pendiente'),
    verificado: boolean('verificado').notNull().default(false),
    puedeEditar: boolean('puede_editar').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('negocios_estado_distrito_idx').on(t.estado, t.distritoId),
    index('negocios_nombre_trgm_idx').using(
      'gin',
      sql`f_unaccent(lower(${t.nombre})) gin_trgm_ops`,
    ),
  ],
)

export const categorias = pgTable('categorias', {
  id: serial('id').primaryKey(),
  nombre: varchar('nombre', { length: 80 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  tipo: tipoItemEnum('tipo').notNull().default('producto'),
  icono: varchar('icono', { length: 50 }),
})

export const negocioCategorias = pgTable(
  'negocio_categorias',
  {
    negocioId: integer('negocio_id')
      .notNull()
      .references(() => negocios.id, { onDelete: 'cascade' }),
    categoriaId: integer('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.negocioId, t.categoriaId] })],
)

export const productos = pgTable(
  'productos',
  {
    id: serial('id').primaryKey(),
    negocioId: integer('negocio_id')
      .notNull()
      .references(() => negocios.id, { onDelete: 'cascade' }),
    categoriaId: integer('categoria_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    tipo: tipoItemEnum('tipo').notNull().default('producto'),
    nombre: varchar('nombre', { length: 150 }).notNull(),
    descripcion: text('descripcion'),
    imagenUrl: text('imagen_url'),
    imagenDeleteUrl: text('imagen_delete_url'),
    precio: numeric('precio', { precision: 10, scale: 2 }).notNull(),
    descuentoPct: smallint('descuento_pct').notNull().default(0),
    stock: integer('stock'), // NULL = no aplica (servicios)
    disponible: boolean('disponible').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('productos_descuento_rango', sql`${t.descuentoPct} BETWEEN 0 AND 100`),
    check('productos_precio_positivo', sql`${t.precio} >= 0`),
    check('productos_stock_positivo', sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
    index('productos_negocio_idx').on(t.negocioId),
    index('productos_categoria_idx').on(t.categoriaId),
    index('productos_ofertas_idx')
      .on(t.descuentoPct)
      .where(sql`${t.descuentoPct} > 0`),
    index('productos_nombre_trgm_idx').using(
      'gin',
      sql`f_unaccent(lower(${t.nombre})) gin_trgm_ops`,
    ),
    index('productos_fts_idx').using(
      'gin',
      sql`to_tsvector('spanish', f_unaccent(${t.nombre} || ' ' || coalesce(${t.descripcion}, '')))`,
    ),
  ],
)
