import { Scl } from './config'
import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { SCL_EXTENSION_MODULES } from './extensions'
import { HOOKS } from './hooks'

import { Project } from '@dialecte/core'

import type { StorageParam, ExtensionModules } from '@dialecte/core'

/**
 * Create an SCL project with pre-configured config, extensions, and hooks.
 * Call .open(name) to initialize the store and hydrate state.
 */
export function createSclProject<
	CustomModules extends ExtensionModules = Record<never, never>,
>(params?: { storage?: StorageParam; extensions?: CustomModules }): Scl.Project<CustomModules> {
	const { storage = { type: 'local' }, extensions } = params ?? {}

	return new Project({
		configs: { scl: SCL_DIALECTE_CONFIG },
		defaultConfigKey: 'scl',
		storage,
		extensions: { base: SCL_EXTENSION_MODULES, custom: extensions },
		hooks: HOOKS,
	}) as Scl.Project<CustomModules>
}
