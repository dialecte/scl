import { version } from '../../package.json'
import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { SCL_EXTENSION_MODULES } from './extensions'
import { HOOKS, createSclImportSession } from './hooks'

import { defineDialecte } from '@dialecte/core'

import type { Config } from './config/dialecte.config'
import type { DialecteDeclaration } from '@dialecte/core'

/**
 * The SCL dialecte, declared once: its id, its version, its config, its extensions and how its hooks are made.
 * `createSclProject` and the test helpers are built from it; pass it to what core derives from a declaration. The
 * hooks are made per owner: the import session keeps its state per file imported, the record hooks keep none.
 * Marked pure: a consumer importing one helper of the main entry leaves the extensions and hooks out of its bundle.
 *
 * @intent read the SCL dialecte's declaration, build test helpers of the SCL dialecte, pass the SCL dialecte to what core derives from a declaration
 */
// Its type is written out: inferred, it costs the whole package a fifth more type instantiations.
export const SCL_DIALECTE: DialecteDeclaration<Config, typeof SCL_EXTENSION_MODULES, 'scl'> =
	/* @__PURE__ */ defineDialecte({
		id: 'scl/v2019C1',
		version,
		configs: { scl: SCL_DIALECTE_CONFIG },
		defaultConfigKey: 'scl',
		extensions: SCL_EXTENSION_MODULES,
		createHooks: function createSclHooks() {
			return { createImportSession: createSclImportSession, ...HOOKS }
		},
	})
