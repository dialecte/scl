import { requiresChildElement } from './requires-child-element'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type { AnyDefinition } from '@dialecte/core'

const TOPOLOGY_LEVELS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS
const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/**
 * The tags of an element that has no reason to stay once it holds nothing — read from the definition: a transparent
 * wrapper (a `Private`), and an element whose content model needs a child element (a category needs a reference, a
 * `DataTypeTemplates` a type). A level of the topology is the project's structure: never removed by a clean-up.
 */
export const PRUNED_WHEN_EMPTY: ReadonlySet<string> = new Set([
	...SCL_DIALECTE_CONFIG.transparentElements,
	...Object.entries(DEFINITION)
		.filter(([tagName, definition]) => {
			if (TOPOLOGY_LEVELS.includes(tagName)) return false
			return requiresChildElement(definition.contentModel)
		})
		.map(([tagName]) => tagName),
])
