import {
	incoherentReferenceDiagnostic,
	incoherentReferenceRelated,
} from './import-diagnostic-builders'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { TUPLE_ROLES } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { ownIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import { isWrittenWhenSet } from '@/v2019C1/extensions/reference/query/ied-tuple/pairs-written-when-set'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import {
	targetTupleParts,
	tupleAddressOf,
} from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import {
	applyTupleReferenceWrite,
	tupleReferenceWrite,
} from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-reference-write'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	CollectedTuplePair,
	CollectedTupleTarget,
	PendingTupleReferrer,
	ReadTuplePair,
	TuplePairReading,
	TupleReferenceImport,
} from './tuple-reference-import.types'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { IncoherentReferenceDiagnostic } from '@/v2019C1/errors/import-diagnostics.types'
import type { TupleReferenceWrite } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

/**
 * Makes the uuid and the names of every imported tuple reference (`ConnectedAP`, `ExtRef`, `FCDA`...)
 * agree. A pair written without its uuid gets the uuid of the element its names name in the file. A
 * pair whose uuid names another element than its names (or than none) gets its names written from
 * the element its uuid names: the uuid wins, and the disagreement is reported. The names are written
 * once for the whole reference, from every pair whose uuid names an element (two pairs may share a
 * name: an agreeing pair may then get a name it left to another attribute, `srcLDInst`); when no
 * names fit every pair (one `iedName` for uuids in two IEDs), the reference is left as read.
 *
 * A uuid naming an element the reference cannot point at (a control block of another kind than its
 * service names, an element of another IED than the one an `FCDA` / `ServerAt` / `GSE` / `SMV`
 * names by where it sits) is reported and left as read; so is a `followsOnly` pair (an LNode's
 * `lnUuid`) whose names disagree, and such a pair never gets its uuid filled. A name naming nothing in the file (another
 * device, for a file of one device), or naming several elements a reference cannot tell apart, a
 * uuid naming nothing in the file, and names not naming a whole address are left as they are.
 *
 * The import has no store access: the pass keeps each target under its address and its uuid, and
 * each reference; the writes are made at the end.
 */
export function createTupleReferenceImport(): TupleReferenceImport {
	const targetsByAddress = new Map<string, string>()
	const targetsByUuid = new Map<string, CollectedTupleTarget>()
	const referrers: PendingTupleReferrer[] = []

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const uuid = readAttribute({ record, name: 'uuid' })
		if (uuid) collectTarget({ record, ancestry, uuid })

		const pairs: readonly TupleReferencePair[] =
			TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
		const collected = pairs.flatMap((pair): CollectedTuplePair[] => {
			const address = referrerTupleAddress({ pair, record, ancestry })
			if (!address) return []
			const pairUuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			return [
				{
					pair,
					address,
					uuid: pairUuid || undefined,
					targetTags: targetTagsOf({ pair, record }),
				},
			]
		})
		if (collected.length > 0) referrers.push({ record, ancestry: [...ancestry], pairs: collected })
	}

	function collectTarget(params: {
		record: AnyRawRecord
		ancestry: readonly AnyRawRecord[]
		uuid: string
	}): void {
		const { record, ancestry, uuid } = params
		const parts = targetTupleParts({ record, ancestry })
		const address = parts ? tupleAddressOf({ parts }) : undefined
		if (!parts || !address) return
		targetsByAddress.set(targetKey({ address, tagName: record.tagName }), uuid)
		targetsByUuid.set(uuid, { tagName: record.tagName, recordId: record.id, address, parts })
	}

	function resolve(): { updates: RecordPatch[]; diagnostics: IncoherentReferenceDiagnostic[] } {
		const updates: RecordPatch[] = []
		const diagnostics: IncoherentReferenceDiagnostic[] = []
		for (const referrer of referrers) {
			const outcome = resolveReferrer({ referrer, targetsByAddress, targetsByUuid })
			if (outcome.update) updates.push(outcome.update)
			diagnostics.push(...outcome.diagnostics)
		}
		return { updates, diagnostics }
	}

	function count(): number {
		return referrers.length
	}

	return { collect, count, resolve }
}

/**
 * The write of one tuple reference: the uuids its names give (see `fillsOf`), then, when a pair's
 * uuid names another element than its names, the names of every pair whose uuid names an element,
 * written from it in one `tupleReferenceWrite`. Nothing more when no names can name every uuid and
 * keep the other names: after the write, each pair it follows must name the element its uuid names,
 * and each other pair the address it named as read. One `incoherent-reference` diagnostic per pair that
 * disagreed or cannot follow its uuid.
 */
function resolveReferrer(params: {
	referrer: PendingTupleReferrer
	targetsByAddress: ReadonlyMap<string, string>
	targetsByUuid: ReadonlyMap<string, CollectedTupleTarget>
}): { update?: RecordPatch; diagnostics: IncoherentReferenceDiagnostic[] } {
	const { referrer, targetsByAddress, targetsByUuid } = params
	const { record, ancestry } = referrer
	const fills = fillsOf({ referrer, targetsByAddress })
	const fillsOnly: TupleReferenceWrite = { attributes: fills, value: undefined }
	const filled = applyTupleReferenceWrite({ record, write: fillsOnly })

	const readings = referrer.pairs.flatMap((collected): ReadTuplePair[] => {
		const uuid = collected.uuid ?? fills[collected.pair.attribute.uuid]
		const target = uuid ? targetsByUuid.get(uuid) : undefined
		if (!uuid || !target) return []
		const reading = pairReadingOf({ collected, target, record, ancestry })
		return [{ collected, uuid, target, reading }]
	})
	const diagnostics = readings.flatMap(({ collected, uuid, target, reading }) =>
		reading === 'follows'
			? []
			: [
					incoherentTupleReferenceDiagnostic({
						record,
						collected,
						uuid,
						target,
						targetsByAddress,
						targetsByUuid,
					}),
				],
	)
	if (!readings.some(({ reading }) => reading === 'disagrees'))
		return { update: recordPatchOf({ record, write: fillsOnly }), diagnostics }

	const followed = readings.filter(({ reading }) => reading !== 'cannot-follow')
	const names = tupleReferenceWrite({
		record: filled,
		pairs: followed.map(({ collected }) => collected.pair),
		partsByUuid: new Map(followed.map(({ uuid, target }) => [uuid, target.parts])),
		ownIedName: ownIedName({ ancestry }),
	})
	const written = names ? applyTupleReferenceWrite({ record: filled, write: names }) : filled
	const keepsEveryAddress = referrer.pairs.every((collected) => {
		const target = followed.find((reading) => reading.collected === collected)?.target
		const address = referrerTupleAddress({ pair: collected.pair, record: written, ancestry })
		return address === (target ? target.address : collected.address)
	})
	if (!names || !keepsEveryAddress)
		return { update: recordPatchOf({ record, write: fillsOnly }), diagnostics }
	const write: TupleReferenceWrite = {
		attributes: { ...fills, ...names.attributes },
		value: names.value,
	}
	return { update: recordPatchOf({ record, write }), diagnostics }
}

/**
 * The uuid of each pair of a reference written without it: the one of the element its names name,
 * when exactly one of the tags it may point at answers (control blocks of different kinds may share
 * a name).
 */
function fillsOf(params: {
	referrer: PendingTupleReferrer
	targetsByAddress: ReadonlyMap<string, string>
}): Record<string, string> {
	const { referrer, targetsByAddress } = params
	const fills: Record<string, string> = {}
	for (const { pair, address, uuid, targetTags } of referrer.pairs) {
		if (uuid || !isWrittenWhenSet({ pair })) continue
		const uuids = targetTags.flatMap((tagName) => {
			const found = targetsByAddress.get(targetKey({ address, tagName }))
			return found ? [found] : []
		})
		if (uuids.length === 1) fills[pair.attribute.uuid] = uuids[0]
	}
	return fills
}

/** How a pair reads against the element its uuid names (see `TuplePairReading`). */
function pairReadingOf(params: {
	collected: CollectedTuplePair
	target: CollectedTupleTarget
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): TuplePairReading {
	const { collected, target, record, ancestry } = params
	const { pair, address, targetTags } = collected
	if (!targetTags.includes(target.tagName)) return 'cannot-follow'
	const { ied } = pair.tuple
	const writesItsIed = 'attribute' in ied || 'text' in ied
	if (!writesItsIed && target.parts.ied !== iedNameOf({ role: ied, record, ancestry }))
		return 'cannot-follow'
	if (target.address === address) return 'follows'
	// names another writer gives (an LNode's binding) are compared, never written
	return isWrittenWhenSet({ pair }) ? 'disagrees' : 'cannot-follow'
}

/** The patch of a write: its attributes, those it removes, its text; `undefined` when it writes nothing. */
function recordPatchOf(params: {
	record: AnyRawRecord
	write: TupleReferenceWrite
}): RecordPatch | undefined {
	const { record, write } = params
	const entries = Object.entries(write.attributes)
	if (entries.length === 0 && write.value === undefined) return undefined
	const removed = entries.flatMap(([name, value]) => (value === undefined ? [name] : []))
	return {
		recordId: record.id,
		attributes: entries.flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }])),
		...(removed.length > 0 ? { removeAttributes: removed } : {}),
		...(write.value === undefined ? {} : { value: write.value }),
	}
}

/**
 * The `incoherent-reference` diagnostic of a tuple reference: `ref.attribute` lists the attributes
 * naming its target (space-separated), `meta.pathValue` is what they name (`P1/LD0/LLN0`); `related`
 * names the element its uuid names, then the one its names name when the file holds exactly one.
 */
function incoherentTupleReferenceDiagnostic(params: {
	record: AnyRawRecord
	collected: CollectedTuplePair
	uuid: string
	target: CollectedTupleTarget
	targetsByAddress: ReadonlyMap<string, string>
	targetsByUuid: ReadonlyMap<string, CollectedTupleTarget>
}): IncoherentReferenceDiagnostic {
	const { record, collected, uuid, target, targetsByAddress, targetsByUuid } = params
	const { pair, address } = collected
	const pathUuids = collected.targetTags.flatMap((tagName) => {
		const found = targetsByAddress.get(targetKey({ address, tagName }))
		return found ? [found] : []
	})
	const pathTarget = pathUuids.length === 1 ? targetsByUuid.get(pathUuids[0]) : undefined
	return incoherentReferenceDiagnostic({
		ref: {
			tagName: record.tagName,
			id: record.id,
			attribute: namingAttributesOf({ pair }).join(' '),
		},
		meta: {
			uuidAttribute: pair.attribute.uuid,
			pathValue: address.slice(address.indexOf(':') + 1),
			uuidValue: uuid,
		},
		related: incoherentReferenceRelated({
			uuidTarget: { tagName: target.tagName, id: target.recordId },
			pathTarget: pathTarget && { tagName: pathTarget.tagName, id: pathTarget.recordId },
		}),
	})
}

/** The attributes of a referrer naming its target in a pair: its IED (when an attribute), then each part. */
function namingAttributesOf(params: { pair: TupleReferencePair }): string[] {
	const { pair } = params
	const { ied } = pair.tuple
	const parts = TUPLE_ROLES.flatMap((role) => {
		const name = pair.tuple[role]
		return name ? [name] : []
	})
	return 'attribute' in ied ? [ied.attribute, ...parts] : parts
}
