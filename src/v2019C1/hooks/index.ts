import { afterCreated } from './after-created'
import { afterDeepClone } from './after-deep-clone'
import { afterStandardizedRecord } from './after-standardized-record'
import { afterUpdated } from './after-updated'
import { beforeClone } from './before-clone'
import { beforeDelete } from './before-delete'
//io
import { createSclIoHooks } from './io'

import { Scl } from '@/v2019C1/config'

import type { IOHooks } from '@dialecte/core'

export const HOOKS: Scl.TransactionHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
	afterDeepClone,
	afterUpdated,
	beforeDelete,
}

export const IO_HOOKS: IOHooks = createSclIoHooks()
