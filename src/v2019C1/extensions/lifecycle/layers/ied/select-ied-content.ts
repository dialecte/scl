import { planLaterBindingInputs } from './plan-later-binding-inputs'
import {
	IED_CONTENT_TAGS,
	SUPERVISION_CAPACITY_ATTRIBUTES,
	SUPERVISION_LN_CLASSES,
} from './select-ied-content.constants'

import { toRef } from '@dialecte/core/helpers'

import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	IedContentRecords,
	IedContentSelection,
	IedContentStep,
} from './select-ied-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { IedExtractParams } from '@/v2019C1/extensions/lifecycle/extract/transaction/ied.types'
import type * as Core from '@dialecte/core'

/**
 * Select schema-qualified instance content before cloning; vendor homonyms stay opaque, warnings name SCL records.
 * Left out: the inputs with `inputs: 'none'` (each rewritten in later-binding form otherwise), the logical nodes
 * supervising subscriptions and a supervision capability declaring such nodes, the receivers, clients, associations
 * and key distribution entries naming another IED (said), and, with later-binding inputs, the receivers and clients
 * naming the IED itself.
 */
export async function selectIedContent(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string; inputs: IedExtractParams['inputs'] },
): Promise<IedContentSelection> {
	const { iedRef, iedName, inputs } = params
	const {
		LN = [],
		IEDName = [],
		ClientLN = [],
		Association = [],
		KDC = [],
		Inputs = [],
		ExtRef = [],
		SupSubscription = [],
	} = await query.findDescendants(iedRef, { collect: [...IED_CONTENT_TAGS] })
	// a vendor homonym stays opaque content: only the document's own elements are selected
	const records: IedContentRecords = {
		LN: LN.filter(isNativeRecord),
		IEDName: IEDName.filter(isNativeRecord),
		ClientLN: ClientLN.filter(isNativeRecord),
		Association: Association.filter(isNativeRecord),
		KDC: KDC.filter(isNativeRecord),
		Inputs: Inputs.filter(isNativeRecord),
		ExtRef: ExtRef.filter(isNativeRecord),
		SupSubscription: SupSubscription.filter(isNativeRecord),
	}
	const steps = [
		inputs === 'none'
			? { leaveOut: records.Inputs.map(idOf), warnings: [] }
			: { leaveOut: [], warnings: [] },
		leaveOutSupervision(records),
		leaveOutReceivers({ records, iedName, dropSelf: inputs === 'later-binding' }),
	]
	const leaveOut = new Set(steps.flatMap((step) => step.leaveOut))
	const laterBinding =
		inputs === 'later-binding'
			? planLaterBindingInputs({ extRefs: writtenExtRefs({ records, leaveOut }) })
			: { edits: [], warnings: [] }
	return {
		leaveOut,
		warnings: [...steps.flatMap((step) => step.warnings), ...laterBinding.warnings],
		edits: laterBinding.edits,
	}
}

/**
 * The logical nodes supervising subscriptions, and a capability declaring that the IED holds such nodes (a maximum
 * above 0): an exported IED holds none.
 */
function leaveOutSupervision(records: IedContentRecords): IedContentStep {
	const logicalNodes = records.LN.filter(function supervises(logicalNode) {
		return SUPERVISION_LN_CLASSES.has(readAttribute({ record: logicalNode, name: 'lnClass' }))
	})
	const capabilities = records.SupSubscription.filter(function declaresSupervision(capability) {
		return SUPERVISION_CAPACITY_ATTRIBUTES.some(function isAboveZero(name) {
			return Number(readAttribute({ record: capability, name, defaults: 'none' }) ?? 0) > 0
		})
	})
	const leftOut = [...logicalNodes, ...capabilities]
	return {
		leaveOut: leftOut.map(idOf),
		warnings: leftOut.map(function warningOf(record) {
			return {
				code: 'supervision-left-out',
				source: { ...toRef(record), id: record.id } as Scl.Ref<'LN' | 'SupSubscription'>,
			} as const
		}),
	}
}

/**
 * Receivers, clients, associations and key distribution entries naming another IED: left out and said. With the inputs
 * in later-binding form, a receiver or a client naming the IED itself is left out too, silently: no input of the file
 * subscribes to a control block any more, so the IED is no receiver of its own.
 */
function leaveOutReceivers(params: {
	records: IedContentRecords
	iedName: string
	/** Whether a receiver or client naming the IED itself is left out: no input of the file subscribes any more. */
	dropSelf: boolean
}): IedContentStep {
	const { records, iedName, dropSelf } = params
	const leaveOut: string[] = []
	const warnings: IedContentStep['warnings'] = []
	const named = [
		...records.IEDName.map(function nameOfReceiver(record) {
			return { record, name: record.value, dropped: dropSelf }
		}),
		...[...records.ClientLN, ...records.Association, ...records.KDC].map(function nameOf(record) {
			const dropped = dropSelf && record.tagName === 'ClientLN'
			return { record, name: readAttribute({ record, name: 'iedName' }), dropped }
		}),
	]
	for (const { record, name, dropped } of named) {
		if (!name) continue
		if (name === iedName) {
			if (dropped) leaveOut.push(record.id)
			continue
		}
		leaveOut.push(record.id)
		warnings.push({
			code: 'ied-reference-left-out',
			source: { ...toRef(record), id: record.id } as Scl.Ref<
				'IEDName' | 'ClientLN' | 'Association' | 'KDC'
			>,
			iedName: name,
		})
	}
	return { leaveOut, warnings }
}

/** The inputs the file holds: those whose `Inputs`, or the logical node holding it, is not left out. */
function writtenExtRefs(params: {
	records: IedContentRecords
	leaveOut: ReadonlySet<string>
}): IedContentRecords['ExtRef'] {
	const { records, leaveOut } = params
	const holderOf = new Map(
		records.Inputs.map(function byInputs(inputs) {
			return [inputs.id, inputs.parent?.id] as const
		}),
	)
	return records.ExtRef.filter(function isWritten(extRef) {
		const inputs = extRef.parent?.id
		const holder = inputs === undefined ? undefined : holderOf.get(inputs)
		return !(inputs && leaveOut.has(inputs)) && !(holder && leaveOut.has(holder))
	})
}

function idOf(record: { id: string }): string {
	return record.id
}
