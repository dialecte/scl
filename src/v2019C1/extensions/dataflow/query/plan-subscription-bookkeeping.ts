import {
	BOOLEAN_FALSE_VALUES,
	BOOLEAN_TRUE_VALUES,
	BUFFERED_ATTRIBUTE,
	CLIENT_LN_TAG,
	REPORT_CONTROL_TAG,
	ENGINEERING_RIGHT_ATTRIBUTE,
	FIXED_ENGINEERING_RIGHT,
	INDEXED_ATTRIBUTE,
} from './plan-subscription-bookkeeping.constants'
import { readSubscriber } from './read-subscriber'
import { registrationPrecision } from './registration-precision'
import { resolveControlBlock } from './resolve-control-block'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { readAttribute } from '@/v2019C1/helpers'
import { SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG } from '@/v2019C1/hooks/before-delete/orphaned-refs.constants'

import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode, IedSection } from './ied-section.types'
import type {
	EndedSubscription,
	PlanSubscriptionBookkeepingParams,
	SubscriptionBookkeeping,
} from './plan-subscription-bookkeeping.types'
import type { Subscriber } from './resolve-registration.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The registrations and supervisions a set of ended subscriptions leaves unused (reads in, operations out): per control
 * block and subscriber IED, once none of the subscriber's ExtRefs uses the control block, its LGOS / LSVS `setSrcRef`
 * value is cleared and its registrations go: of a GOOSE / SV control block every `IEDName` naming its IED, of a report
 * control block each `ClientLN` naming where an ending ExtRef sits (a client with no ExtRef stays). While some still use
 * it, a `ClientLN` naming where none of them sits goes, and an `IEDName` naming only a logical device or logical node
 * none of them is in goes when the others are named already, else one such is cleared to the IED. A registration of a publisher whose
 * engineering right is `fix` is kept, as is a `ClientLN` of a buffered report control block, and one of an indexed
 * report control block followed by a client that stays (its position is the instance number of the clients after it).
 *
 * @internal
 */
export async function planSubscriptionBookkeeping(
	params: PlanSubscriptionBookkeepingParams,
): Promise<SubscriptionBookkeeping> {
	const { context, ending } = params
	const iedSection = await context.iedSection()
	const byControlBlock = await context.extRefsByControlBlock()
	const supervisionIndex = await context.supervisionIndex()
	const endingIds = new Set(ending.map((extRef) => extRef.record.id))
	const bookkeeping: SubscriptionBookkeeping = { registrations: [], supervisions: [], kept: [] }
	const removing = new Map<string, ControlBlockNode>()

	for (const subscription of await endedSubscriptions({ context, ending })) {
		const { controlBlock, subscriber, extRefs } = subscription
		const remaining = (byControlBlock.get(controlBlock.record.id) ?? []).filter(
			(extRef) => extRef.ied.id === subscriber.id && !endingIds.has(extRef.record.id),
		)
		const publisherFixed = isFixed({ ancestry: controlBlock.ancestry })

		if (remaining.length === 0) {
			// a GOOSE / SV subscriber is its IED, a report client the logical node an ending ExtRef sits in
			const nodes = subscribesAsIed(controlBlock)
				? logicalNodesOf({ iedSection, ied: subscriber })
				: extRefs
			const subscribers = nodes.map((node) => readSubscriber({ extRef: node, iedSection }))
			const named = await registrationsNaming({ context, controlBlock, subscribers })
			for (const registration of named) {
				if (publisherFixed)
					bookkeeping.kept.push({ element: registration.ref, why: 'eng-right-fix' })
				else removing.set(registration.record.id, controlBlock)
			}
			const supervision = supervisionIndex.supervisionOf({ controlBlock, subscriber })
			if (supervision) bookkeeping.supervisions.push({ dai: supervision.dai, val: supervision.val })
			continue
		}

		const endingSubscribers = extRefs.map((extRef) => readSubscriber({ extRef, iedSection }))
		const remainingSubscribers = remaining.map((extRef) => readSubscriber({ extRef, iedSection }))
		const named = await registrationsNaming({
			context,
			controlBlock,
			subscribers: endingSubscribers,
		})
		const stillNamed = await registrationsNaming({
			context,
			controlBlock,
			subscribers: remainingSubscribers,
		})
		const stillNamedIds = new Set(stillNamed.map((registration) => registration.record.id))
		// one registration at most is cleared to the IED, none when every remaining ExtRef is named already
		let clearsOne = await anyUnnamed({
			context,
			registrations: stillNamed,
			subscribers: remainingSubscribers,
		})
		for (const registration of named) {
			if (stillNamedIds.has(registration.record.id)) continue
			// a client is a logical node: none of its ExtRefs left, it goes as at zero, never cleared to its IED
			if (registration.record.tagName === CLIENT_LN_TAG) {
				if (publisherFixed)
					bookkeeping.kept.push({ element: registration.ref, why: 'eng-right-fix' })
				else removing.set(registration.record.id, controlBlock)
				continue
			}
			const attributes = SUBSCRIBER_DEVICE_PART_ATTRIBUTES_BY_TAG.get(registration.record.tagName)
			if (!attributes) continue
			if (publisherFixed) {
				bookkeeping.kept.push({ element: registration.ref, why: 'eng-right-fix' })
			} else if (clearsOne) {
				bookkeeping.registrations.push({ element: registration.ref, effect: 'cleared', attributes })
				clearsOne = false
			} else {
				bookkeeping.registrations.push({ element: registration.ref, effect: 'deleted' })
			}
		}
	}

	for (const controlBlock of new Set(removing.values())) {
		const removed = removeRegistrations({ controlBlock, removing })
		bookkeeping.registrations.push(...removed.registrations)
		bookkeeping.kept.push(...removed.kept)
	}
	return bookkeeping
}

/** Whether the IED an element sits in, read from the records above it, has the engineering right `fix`. */
export function isFixed(params: { ancestry: readonly AnyRawRecord[] }): boolean {
	const ied = params.ancestry.find((record) => record.tagName === 'IED')
	return (
		ied !== undefined &&
		readAttribute({ record: ied, name: ENGINEERING_RIGHT_ATTRIBUTE }) === FIXED_ENGINEERING_RIGHT
	)
}

/** The ending ExtRefs grouped by the control block they name and their IED; an ExtRef naming none ends nothing here. */
async function endedSubscriptions(params: {
	context: DataflowContext
	ending: readonly IedNode<'ExtRef'>[]
}): Promise<EndedSubscription[]> {
	const { context, ending } = params
	const byKey = new Map<string, EndedSubscription>()
	for (const extRef of ending) {
		const controlBlock = await resolveControlBlock({ extRef, context })
		if (!controlBlock) continue
		const key = `${controlBlock.record.id}\u0000${extRef.ied.id}`
		const subscription = byKey.get(key) ?? { controlBlock, subscriber: extRef.ied, extRefs: [] }
		subscription.extRefs.push(extRef)
		byKey.set(key, subscription)
	}
	return [...byKey.values()]
}

/** Whether a control block registers its subscribers as IEDs (GOOSE, SV), not as client logical nodes (reports). */
function subscribesAsIed(controlBlock: ControlBlockNode): boolean {
	return controlBlock.record.tagName !== REPORT_CONTROL_TAG
}

/** Every logical node of an IED, each with itself above it, as the subscriber it names. */
function logicalNodesOf(params: { iedSection: IedSection; ied: Scl.Ref<'IED'> }): IedNode[] {
	return params.iedSection.logicalNodes
		.filter((logicalNode) => logicalNode.ied.id === params.ied.id)
		.map((logicalNode) => ({
			...logicalNode,
			ancestry: [...logicalNode.ancestry, logicalNode.record],
		}))
}

/** Whether one of the subscribers is named by none of the registrations. */
async function anyUnnamed(params: {
	context: DataflowContext
	registrations: readonly ControlBlockNode['registrations'][number][]
	subscribers: readonly Subscriber[]
}): Promise<boolean> {
	const { context, registrations, subscribers } = params
	for (const subscriber of subscribers) {
		const naming = await registrationsNamingOne({ context, registrations, subscriber })
		if (!naming) return true
	}
	return false
}

/** Whether one of the registrations names the subscriber. */
async function registrationsNamingOne(params: {
	context: DataflowContext
	registrations: readonly ControlBlockNode['registrations'][number][]
	subscriber: Subscriber
}): Promise<boolean> {
	const { context, registrations, subscriber } = params
	for (const registration of registrations) {
		const ied = namedIed(registration)
		if (ied !== undefined && ied !== subscriber.ied) continue
		if ((await registrationPrecision({ context, registration, subscriber })) !== undefined)
			return true
	}
	return false
}

/**
 * The registrations of a control block naming at least one of the subscribers, in document order. A registration
 * naming its IED by name only is compared on that name first.
 */
async function registrationsNaming(params: {
	context: DataflowContext
	controlBlock: ControlBlockNode
	subscribers: readonly Subscriber[]
}): Promise<ControlBlockNode['registrations'][number][]> {
	const { context, controlBlock, subscribers } = params
	const named: ControlBlockNode['registrations'][number][] = []
	for (const registration of controlBlock.registrations) {
		const ied = namedIed(registration)
		const candidates =
			ied === undefined ? subscribers : subscribers.filter((subscriber) => subscriber.ied === ied)
		for (const subscriber of candidates) {
			const precision = await registrationPrecision({ context, registration, subscriber })
			if (precision === undefined) continue
			named.push(registration)
			break
		}
	}
	return named
}

/**
 * The IED a registration names by name, read from the records it holds; `undefined` when one of its references holds a
 * uuid (the uuid wins, so only its precision tells), or it names none.
 */
function namedIed(registration: ControlBlockNode['registrations'][number]): string | undefined {
	const { record, ancestry } = registration
	const pairs = TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
	const [first] = pairs
	if (!first) return undefined
	const holdsUuid = pairs.some((pair) =>
		Boolean(readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })),
	)
	return holdsUuid ? undefined : iedNameOf({ role: first.tuple.ied, record, ancestry })
}

/**
 * The registrations of one control block that go, each removed unless it is a `ClientLN` whose position counts: every
 * client of a buffered report control block is kept (`buffered-preconfigured`), and in an indexed one a client stays
 * while a client after it stays (`indexed-position`).
 */
function removeRegistrations(params: {
	controlBlock: ControlBlockNode
	removing: ReadonlyMap<string, ControlBlockNode>
}): Pick<SubscriptionBookkeeping, 'registrations' | 'kept'> {
	const { controlBlock, removing } = params
	const going = controlBlock.registrations.filter((registration) =>
		removing.has(registration.record.id),
	)
	const clients = controlBlock.registrations.filter(
		(registration) => registration.record.tagName === CLIENT_LN_TAG,
	)
	const buffered = BOOLEAN_TRUE_VALUES.has(
		readAttribute({ record: controlBlock.record, name: BUFFERED_ATTRIBUTE }),
	)
	// indexed unless written false: the schema's default
	const indexed = !BOOLEAN_FALSE_VALUES.has(
		readAttribute({ record: controlBlock.record, name: INDEXED_ATTRIBUTE }),
	)
	const lastStaying = clients.findLastIndex((client) => !removing.has(client.record.id))

	const removed: Pick<SubscriptionBookkeeping, 'registrations' | 'kept'> = {
		registrations: [],
		kept: [],
	}
	for (const registration of going) {
		const isClient = registration.record.tagName === CLIENT_LN_TAG
		if (isClient && buffered) {
			removed.kept.push({ element: registration.ref, why: 'buffered-preconfigured' })
		} else if (isClient && indexed && clients.indexOf(registration) < lastStaying) {
			removed.kept.push({ element: registration.ref, why: 'indexed-position' })
		} else {
			removed.registrations.push({ element: registration.ref, effect: 'deleted' })
		}
	}
	return removed
}
