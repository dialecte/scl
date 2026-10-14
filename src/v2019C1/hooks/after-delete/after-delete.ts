import { widen } from '@dialecte/core/helpers'

import {
	rebuildPathsOfNamedLNode,
	reconcileSignalSiblingPaths,
	signalName,
} from '@/v2019C1/hooks/shared'

import type { Scl } from '@/v2019C1/config'

/**
 * Once a record is staged for deletion: a removed signal (SourceRef / ControlRef) may leave a
 * sibling the only one of its name, so the references to the siblings that shared it are rebuilt
 * (see signal-sibling-paths.ts); a removed `LNodeSpecNaming` leaves its LNode named by its own
 * naming, so the paths through that LNode are rebuilt. Typed from the hook contract, not redeclared generically: the
 * contract's own generics are checked once.
 */
export const afterDelete: NonNullable<Scl.TransactionHooks['afterDelete']> = async ({
	record,
	parentRecord,
	query,
}) => {
	if (record.tagName === 'LNodeSpecNaming') {
		return rebuildPathsOfNamedLNode(query, {
			specNaming: widen(record),
			holder: widen(parentRecord),
		})
	}
	const name = signalName(widen(record))
	if (!name) return []

	return reconcileSignalSiblingPaths(query, {
		parent: { tagName: parentRecord.tagName, id: parentRecord.id } as Scl.Ref<Scl.ElementsOf>,
		tagName: record.tagName,
		names: [name],
	})
}
