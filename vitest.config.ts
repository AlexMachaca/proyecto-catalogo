import { defineConfig } from 'vitest/config'

export const ENV_TEST = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://catalogo:catalogo_dev@localhost:5434/catalogo_test',
  JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres-xx',
  IMGBB_API_KEY: 'clave-falsa',
  FRONTEND_URL: 'http://localhost:5173',
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: 'admin-de-pruebas-123',
}

export default defineConfig({
  test: {
    env: ENV_TEST,
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, // todos los archivos comparten la misma base
    testTimeout: 20_000,
  },
})
