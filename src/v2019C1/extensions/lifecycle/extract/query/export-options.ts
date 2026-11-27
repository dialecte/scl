import { IED_EXPORT_FILE_TYPES } from './export-options.constants'
import { readIedExportRefusals } from './read-ied-export-refusals'
import { readSelectedIedName } from './read-selected-ied-name'

import type { IedExportOption } from './export-options.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the file types an IED can be exported as by `extract.ied`, in a fixed order (ISD, CID, IID), each offered
 * or refused with the key and data of the error the export would throw: an ISD for a specification IED only, a CID for a real
 * IED whose connections hold a network address, an IID for any real IED. A tool shows the entries from it and never
 * re-derives the rule. Refused as the export is for an IED the document does not hold (`ELEMENT_NOT_FOUND`) or one without a
 * name.
 *
 * @intent which exports an IED offers, can this IED be exported as a CID, can this IED be exported as an IID, can this IED be exported as an ISD, why is the CID export refused
 */
export async function exportOptions(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<IedExportOption[]> {
	const { iedRef } = params
	const iedName = await readSelectedIedName(query, { iedRef })
	const refusals = await readIedExportRefusals(query, {
		iedRef,
		iedName,
		fileTypes: IED_EXPORT_FILE_TYPES,
	})
	return IED_EXPORT_FILE_TYPES.map(function optionOf(fileType): IedExportOption {
		const refusal = refusals[fileType]
		return refusal ? { fileType, offered: false, refusal } : { fileType, offered: true }
	})
}
