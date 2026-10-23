import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ApiError } from '../lib/errores.js'

export const manejarError: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { codigo: err.codigo, mensaje: err.message } }, err.status)
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { codigo: 'http_error', mensaje: err.message } }, err.status)
  }
  console.error(err)
  return c.json({ error: { codigo: 'error_interno', mensaje: 'Error interno del servidor' } }, 500)
}

export const noEncontrado: NotFoundHandler = (c) =>
  c.json({ error: { codigo: 'no_encontrado', mensaje: 'Ruta no encontrada' } }, 404)
