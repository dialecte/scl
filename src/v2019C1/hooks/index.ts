import { beforeClone } from './clone'
import { afterCreated } from './create'
import { afterStandardizedRecord } from './standardized'

import type { DialecteHooks } from '@dialecte/core'

export const HOOKS: DialecteHooks = {
	beforeClone,
	afterStandardizedRecord,
	afterCreated,
}
