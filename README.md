# Catálogo de negocios locales (backend)

API REST para que los negocios de Apurímac publiquen su información y productos/servicios, y la población los busque en un solo lugar y pida por WhatsApp.

**Stack:** Hono · TypeScript · PostgreSQL · Drizzle ORM · Zod · JWT · imgbb · Vitest

- Documentación interactiva de la API: `http://localhost:3000/docs` (especificación en `/openapi.json`)
- Plan y decisiones del MVP: [PLAN_MVP.md](PLAN_MVP.md)

## Puesta en marcha

Requisitos: Node 22+ y Docker.

```bash
npm install
cp .env.example .env        # y completa los valores (ver más abajo)
npm run db:up               # PostgreSQL en Docker (puerto 5434)
npm run db:migrate          # crea las tablas
npm run db:seed             # Apurímac (UBIGEO), categorías y administrador
npm run dev                 # http://localhost:3000
```

### Variables de entorno (`.env`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (`postgres://catalogo:catalogo_dev@localhost:5434/catalogo`) |
| `JWT_SECRET` | Secreto de los tokens, mínimo 32 caracteres (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | Duración del token: `7d`, `12h`… |
| `IMGBB_API_KEY` | Clave de https://api.imgbb.com/ |
| `GOOGLE_CLIENT_ID` | Client ID OAuth (tipo Web). Vacío = el login con Google responde 503 |
| `FRONTEND_URL` | Origen permitido por CORS y base de los enlaces de WhatsApp |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Administrador inicial que crea el seed (solo si no existe) |
| `TRUST_PROXY` | `true` solo detrás de un proxy: usa `X-Forwarded-For` para el rate limiting |
| `NODE_ENV` | `development` · `production` · `test` |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga |
| `npm test` | Tests de integración (usan la base `catalogo_test`, que se crea sola) |
| `npm run typecheck` / `npm run lint` | Chequeo de tipos / ESLint |
| `npm run build` / `npm start` | Compila a `dist/` y arranca |
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` | Aplica migraciones / siembra datos base (idempotentes) |
| `npm run db:studio` | Explorador visual de la base |
| `npm run db:up` / `db:down` | Levanta / detiene PostgreSQL en Docker |

## Cómo funciona

- **Usuario final:** sin cuenta. Ve ofertas, filtra por categoría/ubicación, busca, abre la tienda y pide por WhatsApp (`GET /productos/:id/whatsapp`).
- **Negocio:** se registra (correo/contraseña o Google) y queda `pendiente`. Administra su perfil, categorías y productos en `/mi-negocio`.
- **Administrador:** verifica negocios (los publica), da de baja/reactiva, edita datos y controla el permiso `puede_editar` en `/admin`. Solo negocios `activo` aparecen en la API pública.
- **Buscador:** tolera tildes, mayúsculas, plurales, errores de tipeo y palabras en desorden (PostgreSQL `unaccent` + `pg_trgm` + full-text español). Ajustable en `src/services/busqueda.ts`.
- **Imágenes:** se suben a imgbb (JPG/PNG/WEBP, máx. 2 MB). La API de imgbb no permite borrar, por eso se guarda el `delete_url`.
- **Convenciones:** entradas y salidas en `snake_case`; errores como `{ "error": { "codigo", "mensaje" } }`; listas como `{ datos, total, pagina, limite }`.

## Login con Google

El frontend obtiene un `id_token` con Google Identity Services y lo envía a `POST /api/v1/auth/google` (opcionalmente con `nombre_negocio` para cuentas nuevas). El backend solo necesita `GOOGLE_CLIENT_ID`; el origen del frontend debe estar autorizado en Google Cloud Console.

## Estructura

```
src/
├── app.ts · index.ts          # app Hono y arranque
├── config/env.ts              # variables validadas con Zod
├── db/                        # schema, migrate y seeds (UBIGEO, categorías, admin)
├── middleware/                # auth/roles, errores, rate limit, subida de archivos
├── routes/                    # auth · publico · negocio · admin
├── services/                  # busqueda, catalogo, imgbb, google, whatsapp…
├── docs/openapi.ts            # especificación OpenAPI de /docs
└── lib/                       # validación, slugs, contraseñas, JWT…
tests/                         # Vitest contra PostgreSQL real
drizzle/                       # migraciones SQL
```

## Despliegue

```bash
# Todo en Docker (base + API):
docker compose --profile full up -d --build
docker compose --profile full run --rm api npm run db:migrate:prod
docker compose --profile full run --rm api npm run db:seed:prod   # solo la primera vez
```

Antes de publicar:
- Cambia `POSTGRES_PASSWORD` en `docker-compose.yml` (y `DATABASE_URL`) y usa un `JWT_SECRET` propio.
- Pon la API detrás de HTTPS (Caddy, Nginx…) y activa `TRUST_PROXY=true`.
- Define `FRONTEND_URL` con el dominio real del frontend.
- Respalda el volumen `catalogo_pgdata`.

## Límites conocidos del MVP

- El rate limiting vive en memoria: vale para una sola instancia.
- No hay recuperación de contraseña ni verificación de correo.
- Las imágenes reemplazadas no se borran de imgbb.
- El UBIGEO de `src/db/seed/ubigeo.ts` se cargó de memoria y debe contrastarse con el listado oficial del INEI (83 distritos cargados).
