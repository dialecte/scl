import { isEmptiableContainer } from './emptiable-container'
import { requiredChildGroups } from './requires-child-element'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyDefinition } from '@dialecte/core'

const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/**
 * The tags of a container that has no reason to stay once it holds none of the children its content model needs, read
 * from the definition: a list with no identity of its own (no key fields, no uuid: a `PowerSystemRelations`, a
 * `ProcessResources`, a `DataTypeTemplates`), or a set of references (every child it needs is a reference: a category
 * and its `FunctionCatRef`, a `Variable` and its `VariableApplyTo`). An element of its own that needs a child (an
 * `IED`, an `LNodeType`, an `Application`) is the project's to remove, and so is a level of the topology: an
 * `LNodeType` left holding nothing stays (this rule never removes it), and one nothing names goes by the unused-type
 * rule of the commit instead.
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

/**
 * The elements of their own the schema refuses empty whose removal the delete cascade carries to what names them: a
 * `DataSet` that lost its last entry goes, and the control blocks naming it lose their `datSet` (an optional reference)
 * with their revision raised; a `SubNetwork` that lost its last connected access point goes (the delete of its IED or
 * access point removed the connection).
 */
export const EMPTIED_ELEMENT_TAGS: ReadonlySet<string> = new Set(['DataSet', 'SubNetwork'])

/** The tags an element left holding nothing may be removed for: the wrappers, and the tags that need a child. */
export const PRUNED_WHEN_EMPTY_TAGS: ReadonlySet<string> = new Set([
	...SCL_DIALECTE_CONFIG.transparentElements,
	...CHILD_REQUIRED_TAGS,
	...EMPTIED_ELEMENT_TAGS,
])

/**
 * The tags of an element with an identity of its own (key fields or a uuid), read from the definition: content a
 * container that lost its last required child still holds (an `LNodeType`), unlike its settings (an `Authentication`, a
 * `Text`, a `Private`).
 */
export const IDENTIFIED_TAGS: ReadonlySet<string> = new Set(
	Object.entries(DEFINITION)
		.filter(
			([, definition]) =>
				(definition.attributes.identityFields ?? []).length > 0 ||
				definition.attributes.sequence.includes('uuid'),
		)
		.map(([tagName]) => tagName),
)

/**
 * Per tag that needs a child, the groups of child tags its content model requires one of each, read from the
 * definition: a `Server` an `LDevice` (and its `Authentication`), a `DataTypeTemplates` an `LNodeType` and a `DOType`,
 * a `DataSet` an `FCDA`, a `SubNetwork` a `ConnectedAP`, an `SMVSettings` one of `SmpRate`, `SamplesPerSec` or
 * `SecPerSamples`.
 */
export const REQUIRED_CHILD_GROUPS_BY_TAG: ReadonlyMap<string, readonly ReadonlySet<string>[]> =
	new Map(
		[...CHILD_REQUIRED_TAGS, ...EMPTIED_ELEMENT_TAGS].map(
			(tagName): [string, readonly ReadonlySet<string>[]] => [
				tagName,
				requiredChildGroups(DEFINITION[tagName]?.contentModel),
			],
		),
	)
