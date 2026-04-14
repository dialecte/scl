import path from 'node:path'
/// <reference types="vite/client" />
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
		sourcemap: import.meta.env?.DEV,
		lib: {
			entry: {
				'v2019C1/index': fileURLToPath(new URL('./src/v2019C1/index.ts', import.meta.url)),
				'v2019C1/test': fileURLToPath(new URL('./src/v2019C1/test/index.ts', import.meta.url)),
			},
			name: 'SclDialecte',
			formats: ['es'],
		},
		rollupOptions: {
			external: [/^@dialecte\/core/, 'dexie'],
		},
	},
})
