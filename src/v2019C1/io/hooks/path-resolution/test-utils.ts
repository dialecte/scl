import { createSclTestRecord } from '@/v2019C1/helpers'

import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'
import type { TestRecord } from '@dialecte/core/test'
/**
 * Builds an ancestry stack of SCL elements for use in path-resolution tests.
 * Each tuple is either [tagName, name] or [tagName, attributesObject].
 */
export function createAncestry<GenericElement extends Scl.ElementsOf>(
	...elements: Array<
		[tagName: GenericElement, attributes: Scl.AttributesValueObjectOf<GenericElement>]
	>
): AnyRawRecord[] {
	return elements.map(([tagName, attributes]) =>
		createSclTestRecord({
			record: {
				tagName,
				attributes,
			} as TestRecord<Scl.Config>,
		}),
	)
}
