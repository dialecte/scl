import { afterCreated } from './after-created'
import { afterStandardizedRecord } from './after-standardized-record'
import { beforeClone } from './before-clone'

import type { DialecteHooks } from '@dialecte/core'

export const HOOKS: DialecteHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
}
