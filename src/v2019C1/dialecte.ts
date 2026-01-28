import { createDialecte } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from './config/dialecte.config'

import type { Scl } from './config'

export function createSclDialecte(params: { databaseName: string }) {
	const { databaseName } = params
	return createDialecte<Scl.Config>({
		databaseName: databaseName,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}
