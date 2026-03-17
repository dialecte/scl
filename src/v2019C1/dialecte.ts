import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { EXTENSIONS } from './extensions'

import { openDialecteDocument } from '@dialecte/core'

import type { StorageOptions, Document } from '@dialecte/core'

export function openSclDocument(
	storage: StorageOptions,
): Document<typeof SCL_DIALECTE_CONFIG, typeof EXTENSIONS> {
	return openDialecteDocument({
		config: SCL_DIALECTE_CONFIG,
		storage,
		extensions: EXTENSIONS,
	})
}
