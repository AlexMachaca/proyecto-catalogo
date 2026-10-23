import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public codigo: string,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
