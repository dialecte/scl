import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'

import { openDialecteDocument } from '@dialecte/core'

import type { Scl } from './config/hydrated.types'
import type { StorageOptions } from '@dialecte/core'

export function openSclDocument(storage: StorageOptions): Scl.Document {
	return openDialecteDocument({
		config: SCL_DIALECTE_CONFIG,
		storage,
	})
}
