// Las respuestas de la API usan snake_case (igual que las entradas)
const aSnakeClave = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

export function snake<T>(valor: T): unknown {
  if (Array.isArray(valor)) return valor.map(snake)
  if (valor instanceof Date) return valor.toISOString()
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [aSnakeClave(k), snake(v)]))
  }
  return valor
}
