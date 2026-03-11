import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'

import { openDialecteDocument } from '@dialecte/core'

import type { StorageOptions } from '@dialecte/core'

export function openSclDocument(storage: StorageOptions) {
	return openDialecteDocument({
		config: SCL_DIALECTE_CONFIG,
		storage,
	})
}
