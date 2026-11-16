import { TEMPLATE_ISD_IED_NAME } from './ied-placement.constants'

import type { IsIsdInstanceParams } from './is-isd-instance.types'

/** Whether an IED is the IED of an ISD instance file: read from an ISD, not named `SPECIFICATION` (a template's). */
export function isIsdInstance(params: IsIsdInstanceParams): boolean {
	return params.fileType === 'ISD' && params.iedName !== TEMPLATE_ISD_IED_NAME
}
