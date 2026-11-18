import { CONF_REV_CONTROL_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.constants'

import type { ReferenceUuid } from '@/v2019C1/extensions/reference/constants/reference-uuids.types'

/** Whether a reference names a control block (and not the logical node of the data). */
export function namesControlBlock(reference: ReferenceUuid): boolean {
	return reference.target.some((target) => CONF_REV_CONTROL_TAGS.has(target))
}
