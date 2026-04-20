import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { SCL_EXTENSION_MODULES } from './extensions'
import { HOOKS } from './hooks'

import { openDialecteDocument, createDialecteDocument } from '@dialecte/core'

import type { StorageOptions, ExtensionModules } from '@dialecte/core'

export function openSclDocument<
	CustomModules extends ExtensionModules = Record<never, never>,
>(params: { storage: StorageOptions; extensions?: CustomModules }) {
	const { storage, extensions } = params

	return openDialecteDocument({
		config: SCL_DIALECTE_CONFIG,
		storage,
		extensions: { base: SCL_EXTENSION_MODULES, custom: extensions },
		hooks: HOOKS,
	})
}

export async function createSclDocument<
	CustomModules extends ExtensionModules = Record<never, never>,
>(params: { storage: StorageOptions; extensions?: CustomModules }) {
	const { storage, extensions } = params

	return createDialecteDocument({
		config: SCL_DIALECTE_CONFIG,
		storage,
		extensions: { base: SCL_EXTENSION_MODULES, custom: extensions },
		hooks: HOOKS,
	})
}
