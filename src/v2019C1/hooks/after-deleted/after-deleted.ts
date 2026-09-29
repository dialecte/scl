import { syncMinRequestedScdFileOnDelete } from '@/v2019C1/hooks/shared/min-requested-scd-file/deleted-owners'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function afterDelete<
	GenericElement extends Scl.ElementsOf,
	GenericParentElement extends Scl.ParentsOf<GenericElement>,
>(params: {
	record: Scl.RawRecord<GenericElement>
	parentRecord: Scl.RawRecord<GenericParentElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	return syncMinRequestedScdFileOnDelete(params)
}
