import { SCL_DIALECTE } from './declaration.constants'

import { Project } from '@dialecte/core'

import type { Config, Scl } from './config'
import type { StorageParam, ExtensionModules } from '@dialecte/core'

/**
 * Create an SCL project: every part of it comes from the dialecte's declaration (`SCL_DIALECTE`).
 * Call .open(name) to initialize the store and hydrate state.
 *
 * @intent open an SCL project, work on SCD/SSD/FSD/ASD files, import and edit SCL documents, register custom extensions on an SCL project
 */
export function createSclProject<
	CustomModules extends ExtensionModules = Record<never, never>,
>(params?: { storage?: StorageParam; extensions?: CustomModules }): Scl.Project<CustomModules> {
	const { storage = { type: 'local' }, extensions } = params ?? {}

	return new Project<Config, CustomModules>({
		configs: SCL_DIALECTE.configs,
		defaultConfigKey: SCL_DIALECTE.defaultConfigKey,
		dialecteId: SCL_DIALECTE.id,
		dialecteVersion: SCL_DIALECTE.version,
		storage,
		extensions: { base: SCL_DIALECTE.extensions, custom: extensions },
		hooks: SCL_DIALECTE.createHooks(),
	}) as Scl.Project<CustomModules>
}
