import { SCL_DIALECTE_CONFIG } from '../config'

import { exportXmlFile } from '@dialecte/core'

import type { Config } from '@/v2019C1/config'
import type { Scl } from '@/v2019C1/config'

export function exportSclFile(params: {
	databaseName: string
	extension: Config['io']['supportedFileExtensions'][number]
	withDownload?: boolean
	withDatabaseIds?: boolean
}) {
	const { databaseName, extension, withDownload, withDatabaseIds } = params

	return exportXmlFile({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		databaseName,
		extension,
		withDownload,
		withDatabaseIds,
	})
}
