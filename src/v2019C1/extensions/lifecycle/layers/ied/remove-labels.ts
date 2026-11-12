import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Remove every label of the written file, whatever element of the dialecte holds it. A vendor element of the same
 * name stays, and so does a `Labels` a `Private` holds: what a `Private` holds is its owner's payload.
 */
export async function removeLabels(tx: Core.Transaction<Config>): Promise<void> {
	const holders: readonly string[] = SCL_DIALECTE_CONFIG.parents.Labels
	const labels = await tx.getRecordsByTagName('Labels')
	for (const record of labels) {
		if (isNativeRecord(record) && holders.includes(record.parent?.tagName ?? ''))
			await tx.delete(record)
	}
}
