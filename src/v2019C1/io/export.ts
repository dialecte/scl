import { SCL_DIALECTE_CONFIG } from '../config'

import { exportXmlFile } from '@dialecte/core'

export function exportSclFile(databaseName: string) {
	return exportXmlFile({
		databaseName,
		dialecteConfig: SCL_DIALECTE_CONFIG,
	})
}
