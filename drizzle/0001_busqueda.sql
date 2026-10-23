CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
-- unaccent() no es IMMUTABLE; este envoltorio permite usarla en índices
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint
DROP INDEX "negocios_nombre_trgm_idx";--> statement-breakpoint
DROP INDEX "productos_nombre_trgm_idx";--> statement-breakpoint
CREATE INDEX "productos_fts_idx" ON "productos" USING gin (to_tsvector('spanish', f_unaccent("nombre" || ' ' || coalesce("descripcion", ''))));--> statement-breakpoint
CREATE INDEX "negocios_nombre_trgm_idx" ON "negocios" USING gin (f_unaccent(lower("nombre")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "productos_nombre_trgm_idx" ON "productos" USING gin (f_unaccent(lower("nombre")) gin_trgm_ops);