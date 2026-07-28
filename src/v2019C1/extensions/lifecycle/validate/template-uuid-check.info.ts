import type { TemplateUuidWarningCode, TemplateUuidWarningInfo } from './template-uuid-check.types'

/**
 * Per-code human copy for {@link checkTemplateUuids} warnings — the SINGLE source of truth a
 * consumer UI renders (title / description / fallback) so the explanation never drifts from the
 * checker. The per-occurrence specifics come from each warning's `message`; this map explains the
 * violation CLASS and the recovery strategy the lifecycle engine applies when the identity is
 * unreliable.
 */
export const TEMPLATE_UUID_WARNING_INFO: Record<TemplateUuidWarningCode, TemplateUuidWarningInfo> =
	{
		'cross-type-template-uuid': {
			title: 'Placeholder templateUuid reused across element types',
			description:
				'One templateUuid is carried by elements of several different types, so it cannot ' +
				'identify a single template element — it is an authoring placeholder, not real lineage.',
			fallback:
				'Template lineage is ignored for these elements; each instance is recognised by its name ' +
				'within its parent instead, so the merge still proceeds.',
		},
		'duplicate-instance-uuid': {
			title: 'Duplicate instance uuid',
			description:
				'The same uuid is used by more than one element. Every instance uuid in an SCL must be ' +
				'unique, so uuid-based identity is ambiguous for the affected elements.',
			fallback:
				'The affected elements are matched by name and position rather than uuid, so the merge ' +
				'still proceeds — resolve the duplication to restore reliable identity.',
		},
		'template-uuid-type-mismatch': {
			title: 'templateUuid resolves to a different element type',
			description:
				'A templateUuid points in-file to an element of a different type than the one carrying ' +
				'it. An instance cannot derive from a template of another type, so the lineage is inconsistent.',
			fallback:
				'The mismatched lineage is ignored and the element is recognised by name, so the merge ' +
				'still proceeds.',
		},
	}
