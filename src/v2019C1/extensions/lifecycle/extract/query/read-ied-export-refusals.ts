import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttributes } from '@/v2019C1/helpers'

import type { IedExportFileType, IedExportRefusal } from './export-options.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Why `extract.ied` refuses each file type for an IED, `undefined` when it writes it: an ISD is written for a specification
 * IED only, a CID for a real IED with a network address (one of its connections holds an `Address`). One rule for the export
 * and for the options a tool reads.
 */
export async function readIedExportRefusals(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string },
): Promise<Record<IedExportFileType, IedExportRefusal | undefined>> {
	const { iedRef, iedName } = params
	const meta = { ied: { tagName: 'IED' as const, id: iedRef.id } }
	const classifications = await classifyIeds(query)
	const implemented = classifications.some(function isSelectedImplemented(classification) {
		return classification.ied.id === iedRef.id && classification.kind === 'implemented'
	})
	if (!implemented) {
		return { ISD: undefined, CID: { key: 'IED_NOT_IMPLEMENTED', meta } }
	}
	const connected = await holdsAnAddress(query, { iedRef, iedName })
	return {
		ISD: { key: 'IED_NOT_SPECIFICATION', meta },
		CID: connected ? undefined : { key: 'IED_NOT_CONNECTED', meta },
	}
}

/** Whether one of the IED's connections (its name and one of its access points) holds an `Address`. */
async function holdsAnAddress(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string },
): Promise<boolean> {
	const { iedRef, iedName } = params
	const accessPoints = await query.getChildren(iedRef, 'AccessPoint')
	const apNames = new Set(accessPoints.map((record) => readAttributes({ record }).name))
	const connections = await query.getRecordsByTagName('ConnectedAP')
	return connections.some(function isAddressedConnectionOfIed(connection) {
		if (!isNativeRecord(connection)) return false
		const { iedName: connectedIed, apName } = readAttributes({ record: connection })
		return (
			connectedIed === iedName &&
			apNames.has(apName) &&
			connection.children.some((child) => child.tagName === 'Address')
		)
	})
}
