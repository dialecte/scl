import { exportXmlFile } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '../config'

export function exportSclFile(databaseName: string) {
	return exportXmlFile({
		databaseName,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}
