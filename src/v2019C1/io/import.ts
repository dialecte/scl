import { importXmlFiles } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '../config'

export function importSclFiles(params: { files: File[]; useCustomRecordsIds?: boolean }) {
	const { files, useCustomRecordsIds = false } = params
	return importXmlFiles({
		files,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		useCustomRecordsIds,
	})
}
