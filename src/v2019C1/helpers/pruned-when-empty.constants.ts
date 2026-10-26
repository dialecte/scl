import { isEmptiableContainer } from './emptiable-container'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyDefinition } from '@dialecte/core'

const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/**
 * The tags of a container that has no reason to stay once it holds none of the children its content model needs, read
 * from the definition: a list with no identity of its own (no key fields, no uuid: a `PowerSystemRelations`, a
 * `ProcessResources`, a `DataTypeTemplates`), or a set of references (every child it needs is a reference: a category
 * and its `FunctionCatRef`, a `Variable` and its `VariableApplyTo`). An element of its own that needs a child (an
 * `IED`, an `LNodeType`, an `Application`) is the project's to remove, and so is a level of the topology.
 */
export const CHILD_REQUIRED_TAGS: ReadonlySet<string> = new Set(
	Object.entries(DEFINITION)
		.filter(([tagName, definition]) => isEmptiableContainer({ tagName, definition }))
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
