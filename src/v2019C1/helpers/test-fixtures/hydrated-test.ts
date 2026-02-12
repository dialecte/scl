import { createTestDialecte, XMLNS_DEV_NAMESPACE, DEV_ID } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { EXTENSIONS } from '@/v2019C1/extensions'

export const XMLNS_SCL_NAMESPACE = `xmlns="http://www.iec.ch/61850/2003/SCL"`
export const XMLNS_SCL_6_100_NAMESPACE = `xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100"`
export const ALL_XMLNS_NAMESPACES = `${XMLNS_SCL_NAMESPACE} ${XMLNS_SCL_6_100_NAMESPACE} ${XMLNS_DEV_NAMESPACE}`

export async function createSclTestDialecte(params: { xmlString: string }) {
	const { xmlString } = params

	return await createTestDialecte({
		xmlString,
		dialecteConfig: SCL_DIALECTE_CONFIG,
		extensions: EXTENSIONS,
	})
}

export { XMLNS_DEV_NAMESPACE, DEV_ID }
