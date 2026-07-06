import { afterCreated } from './after-created'
import { afterDeepClone } from './after-deep-clone'
import { afterStandardizedRecord } from './after-standardized-record'
import { afterUpdated } from './after-updated'
import { beforeClone } from './before-clone'
import { beforeDelete } from './before-delete'

import { Scl } from '@/v2019C1/config'

// Record-lifecycle hooks, fully typed against the SCL config with no cast: they
// are provided on the Project instance (see createSclProject), not stored on the
// config, so there is no Config→hooks self-reference.
export const HOOKS: Scl.TransactionHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
	afterDeepClone,
	afterUpdated,
	beforeDelete,
}

// Re-exported so createSclProject can build fresh (stateful) io hooks per project.
export { createSclIoHooks } from './io'
