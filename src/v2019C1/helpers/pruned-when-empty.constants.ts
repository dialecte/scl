import { requiresChildElement } from './requires-child-element'
import { isTopologyLevel } from './topology-levels'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyDefinition } from '@dialecte/core'

const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/**
 * The tags whose content model needs a child element, read from the definition (a category needs a reference, a
 * `DataTypeTemplates` a type, a `PowerSystemRelations` a relation). A level of the topology is the project's structure:
 * never among them.
 */
export const CHILD_REQUIRED_TAGS: ReadonlySet<string> = new Set(
	Object.entries(DEFINITION)
		.filter(([tagName, definition]) => {
			if (isTopologyLevel(tagName)) return false
			return requiresChildElement(definition.contentModel)
		})
		.map(([tagName]) => tagName),
)

/**
 * The `type` of a transparent wrapper carrying the dialecte's own elements: the prefix of a namespace it declares
 * beside the default one (a `Private type="eIEC61850-6-100"`). A wrapper of another type is private data of a tool.
 */
export const NAMESPACE_WRAPPER_TYPES: ReadonlySet<string> = new Set(
	Object.values(SCL_DIALECTE_CONFIG.namespaces)
		.map((namespace) => namespace.prefix)
		.filter((prefix) => prefix !== SCL_DIALECTE_CONFIG.namespaces.default.prefix),
)

/** The tags an element left holding nothing may be removed for: the wrappers, and the tags that need a child. */
export const PRUNED_WHEN_EMPTY_TAGS: ReadonlySet<string> = new Set([
	...SCL_DIALECTE_CONFIG.transparentElements,
	...CHILD_REQUIRED_TAGS,
])
