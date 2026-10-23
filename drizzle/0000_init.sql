CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."estado_negocio" AS ENUM('pendiente', 'activo', 'suspendido');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('negocio', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tipo_item" AS ENUM('producto', 'servicio');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"tipo" "tipo_item" DEFAULT 'producto' NOT NULL,
	"icono" varchar(50),
	CONSTRAINT "categorias_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "categorias_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" char(2) PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distritos" (
	"id" char(6) PRIMARY KEY NOT NULL,
	"provincia_id" char(4) NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negocio_categorias" (
	"negocio_id" integer NOT NULL,
	"categoria_id" integer NOT NULL,
	CONSTRAINT "negocio_categorias_negocio_id_categoria_id_pk" PRIMARY KEY("negocio_id","categoria_id")
);
--> statement-breakpoint
CREATE TABLE "negocios" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"descripcion" text,
	"logo_url" text,
	"logo_delete_url" text,
	"direccion" varchar(255),
	"distrito_id" char(6),
	"ruc" varchar(11),
	"whatsapp" varchar(15),
	"facebook" varchar(255),
	"instagram" varchar(255),
	"tiktok" varchar(255),
	"sitio_web" varchar(255),
	"estado" "estado_negocio" DEFAULT 'pendiente' NOT NULL,
	"verificado" boolean DEFAULT false NOT NULL,
	"puede_editar" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negocios_usuario_id_unique" UNIQUE("usuario_id"),
	CONSTRAINT "negocios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"negocio_id" integer NOT NULL,
	"categoria_id" integer,
	"tipo" "tipo_item" DEFAULT 'producto' NOT NULL,
	"nombre" varchar(150) NOT NULL,
	"descripcion" text,
	"imagen_url" text,
	"imagen_delete_url" text,
	"precio" numeric(10, 2) NOT NULL,
	"descuento_pct" smallint DEFAULT 0 NOT NULL,
	"stock" integer,
	"disponible" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_descuento_rango" CHECK ("productos"."descuento_pct" BETWEEN 0 AND 100),
	CONSTRAINT "productos_precio_positivo" CHECK ("productos"."precio" >= 0),
	CONSTRAINT "productos_stock_positivo" CHECK ("productos"."stock" IS NULL OR "productos"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provincias" (
	"id" char(4) PRIMARY KEY NOT NULL,
	"departamento_id" char(2) NOT NULL,
	"nombre" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"google_id" varchar(64),
	"rol" "rol" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "distritos" ADD CONSTRAINT "distritos_provincia_id_provincias_id_fk" FOREIGN KEY ("provincia_id") REFERENCES "public"."provincias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_categorias" ADD CONSTRAINT "negocio_categorias_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_categorias" ADD CONSTRAINT "negocio_categorias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_distrito_id_distritos_id_fk" FOREIGN KEY ("distrito_id") REFERENCES "public"."distritos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provincias" ADD CONSTRAINT "provincias_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negocios_estado_distrito_idx" ON "negocios" USING btree ("estado","distrito_id");--> statement-breakpoint
CREATE INDEX "negocios_nombre_trgm_idx" ON "negocios" USING gin ("nombre" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "productos_negocio_idx" ON "productos" USING btree ("negocio_id");--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "productos_ofertas_idx" ON "productos" USING btree ("descuento_pct") WHERE "productos"."descuento_pct" > 0;--> statement-breakpoint
CREATE INDEX "productos_nombre_trgm_idx" ON "productos" USING gin ("nombre" gin_trgm_ops);