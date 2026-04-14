import { afterCreated } from './after-created'
import { afterStandardizedRecord } from './after-standardized-record'
import { beforeClone } from './before-clone'

import type { TransactionHooks } from '@dialecte/core'

export const HOOKS: TransactionHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
}
