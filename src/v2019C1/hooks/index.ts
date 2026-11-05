import { afterCreated } from './after-created'
import { afterDelete } from './after-delete'
import { afterStandardizedRecord } from './after-standardized-record'
import { afterUpdated } from './after-updated'
import { beforeClone } from './before-clone'
import { beforeCommit } from './before-commit'
import { beforeDelete } from './before-delete'

import { Scl } from '@/v2019C1/config'

// Record-lifecycle hooks, fully typed against the SCL config with no cast: they
// are provided on the Project instance (see the declaration), not stored on the
// config, so there is no Config→hooks self-reference.
export const HOOKS: Scl.TransactionHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
	afterUpdated,
	beforeDelete,
	afterDelete,
	beforeCommit,
}

// Re-exported so the declaration hands core the factory of the import session, one per file.
export { createSclImportSession } from './io'
