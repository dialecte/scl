import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'
import { EXTENSIONS } from './extensions'

import { createDialecte } from '@dialecte/core'

export function createSclDialecte(params: { databaseName: string }) {
	const { databaseName } = params
	return createDialecte({
		databaseName: databaseName,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		extensions: EXTENSIONS,
	})
}
