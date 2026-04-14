import { afterCreated } from './after-created'
import { afterStandardizedRecord } from './after-standardized-record'
import { afterUpdated } from './after-updated'
import { beforeClone } from './before-clone'
import { beforeDelete } from './before-delete'

import type { TransactionHooks } from '@dialecte/core'

export const HOOKS: TransactionHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
	afterUpdated,
	beforeDelete,
}
