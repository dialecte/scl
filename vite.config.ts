import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// VITE
import { defineConfig } from 'vite'
// VITE PLUGINS
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		dts({
			tsconfigPath: path.resolve(__dirname, './tsconfig.build.json'),
			insertTypesEntry: true,
		}),
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	optimizeDeps: {
		exclude: ['@dialecte/core'],
	},
	build: {
		sourcemap: process.env.NODE_ENV === 'development',
		lib: {
			entry: {
				'v2019C1/index': fileURLToPath(new URL('./src/v2019C1/index.ts', import.meta.url)),
				'v2019C1/test': fileURLToPath(new URL('./src/v2019C1/test/index.ts', import.meta.url)),
			},
			name: 'SclDialecte',
			formats: ['es'],
		},
		rollupOptions: {
			external: [/^@dialecte\/core/, 'dexie', 'libxml2-wasm', /^vitest/],
		},
	},
})
