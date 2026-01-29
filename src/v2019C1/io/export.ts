import { SCL_DIALECTE_CONFIG } from '../config'

import { exportXmlFile } from '@dialecte/core'

import type { Scl } from '@/v2019C1/config'

export function exportSclFile(params: {
	databaseName: string
	extension: Scl.Config['io']['supportedFileExtensions'][number]
}) {
	const { databaseName, extension } = params

	return exportXmlFile({
		databaseName,
		extension,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}
