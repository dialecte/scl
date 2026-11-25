import { extractIsd } from './extract-isd'
import { extractRealIed } from './extract-real-ied'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { IedExtractParams, IedExtractResult } from './ied.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Export one IED into an empty target, by the type of the file written (`fileType`):
 * - `'ISD'`: a specification IED with the process part it implements (see `extractIsd`);
 * - `'CID'`: a real IED for its configuration tool: the IED as the project holds it, its own communication and the data types
 *   it needs; its inputs and outputs bound to an IED the file does not hold reduced to the only form a system tool may
 *   write (an input without internal address removed, the others and every output keeping their internal address without
 *   a source); receivers and report clients by `clientRefs`; the source unchanged.
 *
 * @intent export an IED into an ISD or a CID, write a CID for one IED, extract a real IED for its configuration tool, export the
 * communication part of one IED
 */
export async function ied(
	tx: Core.Transaction<Config>,
	params: IedExtractParams,
): Promise<IedExtractResult> {
	switch (params.fileType) {
		case 'ISD':
			return extractIsd(tx, params)
		case 'CID':
			return extractRealIed(tx, params)
		default:
			throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
				meta: { option: 'fileType', value: String((params as { fileType?: unknown }).fileType) },
				detail: 'extract.ied: an ISD or a CID is written',
			})
	}
}
