import { widen } from '@dialecte/core/helpers'

import { reconcileSignalSiblingPaths, signalName } from '@/v2019C1/hooks/shared'

import type { Scl } from '@/v2019C1/config'

/**
 * Once a record is staged for deletion: a removed signal (SourceRef / ControlRef) may leave a
 * sibling the only one of its name, so the references to the siblings that shared it are rebuilt
 * (see signal-sibling-paths.ts). Typed from the hook contract, not redeclared generically: the
 * contract's own generics are checked once.
 */
export const afterDelete: NonNullable<Scl.TransactionHooks['afterDelete']> = async ({
	record,
	parentRecord,
	query,
}) => {
	const name = signalName(widen(record))
	if (!name) return []

	return reconcileSignalSiblingPaths(query, {
		parent: { tagName: parentRecord.tagName, id: parentRecord.id } as Scl.Ref<Scl.ElementsOf>,
		tagName: record.tagName,
		names: [name],
	})
}
