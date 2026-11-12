import {
	EXPECTED_FROM_BINDING,
	EXPECTED_SERVICE,
	INPUT_DESCRIPTION,
	SERVICE_TYPE,
} from './plan-later-binding-inputs.constants'

import { EXT_REF_LATER_BINDING } from '@/v2019C1/extensions/dataflow/constants/ext-ref-state.constants'
import { readAttributes } from '@/v2019C1/helpers'

import type { RecordEdit } from './ied-process.types'
import type { Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'

/**
 * Each input of the IED in later-binding form: its description, internal address and expected data and service kept,
 * an expected value it lacks taken from the source it was bound to, its service type equal to its expected service, and
 * nothing of that source (its IED, address, data, control block, their uuids). An input still lacking its description,
 * what a later binding requires or a service (no expected service and no service type) is written as it is, and said.
 */
export function planLaterBindingInputs(params: { extRefs: readonly Scl.RawRecord<'ExtRef'>[] }): {
	edits: RecordEdit[]
	warnings: ExtractWarning[]
} {
	const edits: RecordEdit[] = []
	const warnings: ExtractWarning[] = []
	for (const extRef of params.extRefs) {
		const current = readAttributes({ record: extRef, defaults: 'none' }) as Record<
			string,
			string | undefined
		>
		const attributes = laterBindingAttributes(current)
		const written = { ...current, ...attributes }
		if (Object.keys(attributes).length > 0)
			edits.push({ ref: { tagName: 'ExtRef', id: extRef.id }, attributes })
		const missing = [INPUT_DESCRIPTION, ...EXT_REF_LATER_BINDING.required, SERVICE_TYPE].filter(
			function isMissing(name) {
				return !written[name]
			},
		)
		if (missing.length > 0)
			warnings.push({
				code: 'input-incomplete',
				source: { tagName: 'ExtRef', id: extRef.id },
				missing,
			})
	}
	return { edits, warnings }
}

/** What changes on an input: the expected values it lacks, its binding removed, its service type its expected service. */
function laterBindingAttributes(
	current: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
	const attributes: Record<string, string | undefined> = {}
	for (const { expected, bound } of EXPECTED_FROM_BINDING) {
		if (!current[expected] && current[bound]) attributes[expected] = current[bound]
	}
	for (const name of EXT_REF_LATER_BINDING.forbidden) {
		if (current[name] !== undefined) attributes[name] = undefined
	}
	const service = attributes[EXPECTED_SERVICE] ?? current[EXPECTED_SERVICE]
	if (service !== current[SERVICE_TYPE]) attributes[SERVICE_TYPE] = service
	else delete attributes[SERVICE_TYPE]
	return attributes
}
