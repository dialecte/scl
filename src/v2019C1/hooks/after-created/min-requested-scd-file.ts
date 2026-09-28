import {
	resolveOwningIed,
	syncMinRequestedScdFile,
} from '@/v2019C1/hooks/shared/min-requested-scd-file'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function syncMinRequestedScdFileOnCreate<
	GenericElement extends Scl.ElementsOf,
>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params

	const iedRef = await resolveOwningIed({ record: childRecord, query })
	if (!iedRef) return []

	return syncMinRequestedScdFile({ iedRef, query })
}
