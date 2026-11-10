import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from '../../vite.config'
import { DECLARATION_MARKER, TREE_SHAKE_BUILD_TIMEOUT_MS } from './main-entry-tree-shake.constants'

import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

import type { Rolldown } from 'vite'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
/** This run's own folder, removed after it. */
const WORK = path.join(ROOT, '.tmp', `tree-shake-${process.pid}`)

/** A consumer's bundle of one helper of the main entry, core kept external as an app's own dependency. */
async function bundleOneHelper(): Promise<string> {
	await mkdir(WORK, { recursive: true })
	const entry = path.join(WORK, 'entry.ts')
	await writeFile(
		entry,
		`export { isNamespaceWrapper } from ${JSON.stringify(path.join(ROOT, 'src/v2019C1/index.ts'))}\n`,
	)
	const built = await build({
		configFile: false,
		root: ROOT,
		logLevel: 'silent',
		resolve: viteConfig.resolve,
		build: {
			write: false,
			lib: { entry, formats: ['es'] },
			rollupOptions: { external: [/^@dialecte\/core/] },
		},
	})
	const outputs = [built].flat() as Rolldown.RolldownOutput[]
	return outputs
		.flatMap(({ output }) => output)
		.map((file) => (file.type === 'chunk' ? file.code : ''))
		.join('\n')
}

afterAll(async () => {
	await rm(WORK, { recursive: true, force: true })
})

describe('the main entry, for a consumer that imports one helper', () => {
	it(
		'leaves the declaration out, and the extensions and hooks with it',
		async () => {
			await expect(bundleOneHelper()).resolves.not.toContain(DECLARATION_MARKER)
		},
		TREE_SHAKE_BUILD_TIMEOUT_MS,
	)
})
