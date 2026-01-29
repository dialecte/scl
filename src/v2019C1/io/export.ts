import { SCL_DIALECTE_CONFIG } from '../config'

import { exportXmlFile } from '@dialecte/core'

import type { Scl } from '@/v2019C1/config'

export function exportSclFile(params: {
	databaseName: string
	extension: Scl.Config['io']['supportedFileExtensions'][number]
	withDownload?: boolean
}) {
	const { databaseName, extension, withDownload } = params

	return exportXmlFile({
		databaseName,
		extension,
		withDownload,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}
