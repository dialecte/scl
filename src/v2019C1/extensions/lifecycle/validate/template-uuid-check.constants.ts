import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { INSTANCE_TAGS } from '@/v2019C1/extensions/lifecycle/engine/instance-tag.constants'

import type { TemplateUuidWarningCode, TemplateUuidWarningInfo } from './template-uuid-check.types'

/**
 * The elements a function reference may name: every form one function is placed as.
 */
const FUNCTION_FORM_TAGS: readonly string[] = UUID_REFERENCE_PAIRS.FunctionRef.flatMap(
	(pair) => pair.target,
)

/**
 * The element types an identity check reads as one, each tag mapped to the tag naming its family. A function written
 * once is placed as a function, a subfunction, an equipment function or an equipment subfunction, and a function
 * template is any of them before it is placed: those forms are one type, whatever tag one of them carries. Derived from
 * what a function reference may name and the templates that become those forms; an element outside the map is its own
 * type.
 */
export const INSTANCE_TAG_FAMILIES: ReadonlyMap<string, string> = (() => {
	const familyTag = FUNCTION_FORM_TAGS[0]
	const templateTags = Object.entries(INSTANCE_TAGS)
		.filter(([, instanceTag]) => FUNCTION_FORM_TAGS.includes(instanceTag))
		.map(([templateTag]) => templateTag)

	return new Map([...FUNCTION_FORM_TAGS, ...templateTags].map((tagName) => [tagName, familyTag]))
})()

/**
 * Per-code human copy for {@link checkTemplateUuids} warnings — the SINGLE source of truth a
 * consumer UI renders (title / description / fallback) so the explanation never drifts from the
 * checker. The per-occurrence specifics come from each warning's `message`; this map explains the
 * violation CLASS and the recovery strategy the lifecycle engine applies when the identity is
 * unreliable — stated as what the engine does, not as what a consumer should show or do: that
 * wording is the consumer's, keyed by the code.
 */
export const TEMPLATE_UUID_WARNING_INFO: Record<TemplateUuidWarningCode, TemplateUuidWarningInfo> =
	{
		'cross-type-template-uuid': {
			title: 'Placeholder templateUuid reused across element types',
			description:
				'One templateUuid is carried by elements of several different types, so it cannot ' +
				'identify a single template element — it is an authoring placeholder, not real lineage. ' +
				'The function forms (function, subfunction, equipment function, equipment subfunction ' +
				'and their templates) count as one type.',
			fallback:
				'Template lineage is ignored for these elements: none is recognised as an instance of a ' +
				'template element. A report then lists the template element as new and the existing ' +
				'element as an addition of the project.',
		},
		'duplicate-instance-uuid': {
			title: 'Duplicate instance uuid',
			description:
				'The same uuid is used by more than one element. Every instance uuid in an SCL must be ' +
				'unique, so uuid-based identity is ambiguous for the affected elements.',
			fallback:
				'Identity by uuid is ambiguous for the affected elements: which of them a reference or a ' +
				'template element resolves to is not defined.',
		},
		'template-uuid-type-mismatch': {
			title: 'templateUuid resolves to a different element type',
			description:
				'A templateUuid points in-file to an element of a different type than the one carrying ' +
				'it. An instance cannot derive from a template of another type, so the lineage is inconsistent.',
			fallback:
				'The mismatched lineage is ignored: the element is not recognised as an instance of a ' +
				'template element. A report then lists the template element as new and the existing ' +
				'element as an addition of the project.',
		},
	}
