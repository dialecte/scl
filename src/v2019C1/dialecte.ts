import { Scl } from './config'
import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { SCL_EXTENSION_MODULES } from './extensions'
import { HOOKS, createSclImportSession } from './hooks'

import { Project } from '@dialecte/core'

import type { Config } from './config'
import type { StorageParam, ExtensionModules } from '@dialecte/core'

/**
 * Create an SCL project with pre-configured config, extensions, and hooks.
 * Call .open(name) to initialize the store and hydrate state.
 *
 * @intent open an SCL project, work on SCD/SSD/FSD/ASD files, import and edit SCL documents, register custom extensions on an SCL project
 */
export function createSclProject<
	CustomModules extends ExtensionModules = Record<never, never>,
>(params?: { storage?: StorageParam; extensions?: CustomModules }): Scl.Project<CustomModules> {
	const { storage = { type: 'local' }, extensions } = params ?? {}

	return new Project<Config, CustomModules>({
		configs: { scl: SCL_DIALECTE_CONFIG },
		defaultConfigKey: 'scl',
		storage,
		extensions: { base: SCL_EXTENSION_MODULES, custom: extensions },
		// All hooks on the instance: the import session (one per file imported) + record hooks.
		hooks: { createImportSession: createSclImportSession, ...HOOKS },
	}) as Scl.Project<CustomModules>
}
