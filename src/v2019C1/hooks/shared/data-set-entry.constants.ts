import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyDefinition } from '@dialecte/core'

const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/** The tags of a control block sending a data set by its name (`datSet`), read from the definition, a log control too. */
export const DATA_SET_SENDER_TAGS: ReadonlySet<string> = new Set(
	Object.entries(DEFINITION)
		.filter(([, definition]) => definition.attributes.sequence.includes('datSet'))
		.map(([tagName]) => tagName),
)
