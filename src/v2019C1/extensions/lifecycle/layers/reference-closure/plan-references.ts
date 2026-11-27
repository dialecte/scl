import { planProcessReferences } from './process-references'
import {
	INPUT_LATER_BINDING_NEEDS,
	INPUT_SOURCE_ATTRIBUTES,
	INPUT_CONTROL_BLOCK_NAME_ATTRIBUTES,
	INPUT_UUID_ATTRIBUTES,
	INTERNAL_ADDRESS,
	OUTPUT_UUID_ATTRIBUTES,
	OUTPUT_SOURCE_ATTRIBUTES,
	REFERENCE_HOLDER_TAGS,
	IED_RELATIVE_PREFIX,
	SUPERVISIONS,
	UUID_TARGET_TAGS,
} from './reference-closure.constants'

import { toRef } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { createDataflowContext } from '@/v2019C1/extensions/dataflow/query/dataflow-context'
import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'

import type {
	ClassifiedReference,
	ClearedSourceReferencesParams,
	PlanContribution,
	ClosureRoot,
	PlanReferencesParams,
	ReferenceAction,
	ReferenceClass,
	ReferenceFamily,
	ReferencePlan,
	ReferencePolicy,
	Decision,
	HolderRecords,
	Landing,
} from './reference-closure.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { RecordEdit } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'
import type * as Core from '@dialecte/core'

/**
 * Classify every reference the roots make — inputs and outputs bound to an IED, receivers and report clients on their control
 * blocks, associations and key distribution entries, supervisions of a control block — as `inside` (it names what the closure
 * holds), `present` (it names an IED of the destination outside the closure) or `absent`, then act on each as the policy says
 * for its family and class. Whatever the policy, the standard's limits hold: an input with an internal address is never left
 * out, an output never; a reduction removes the names and uuids of the source together, so no half reference is written.
 * An input reduced keeps its internal address, expected data and description; one left without what a later binding needs
 * is listed. An `Inputs` or `Outputs` whose every child is left out goes with them. Reads each root's records by tag once and
 * the destination's IEDs once; the source is not written.
 *
 * @intent which references of an IED leave the file, reduce the inputs bound to IEDs outside a file, classify references inside or outside a closure, cut the references of an exported or copied IED
 */
export async function planReferences(params: PlanReferencesParams): Promise<ReferencePlan> {
	const { roots, sourceQuery, destinationQuery, policy, processPolicy } = params
	// the IED section is read only for IED roots; the process references only of the other roots
	const iedRoots = roots.filter((root) => root.depth === 'interface' || root.ref.tagName === 'IED')
	const processRoots = roots.flatMap((root) =>
		root.depth === 'whole' && root.ref.tagName !== 'IED' ? [root.ref] : [],
	)
	invariant(iedRoots.length === 0 || policy, {
		key: 'ELEMENT_NOT_FOUND',
		detail: 'planReferences: IED roots need a policy for the IED families',
	})
	invariant(processRoots.length === 0 || processPolicy, {
		key: 'ELEMENT_NOT_FOUND',
		ref: processRoots[0],
		detail: 'planReferences: a root that is no IED needs a policy for the process families',
	})
	const plans = await Promise.all([
		iedRoots.length > 0 && policy
			? planIedReferences({ ...params, roots: iedRoots, policy })
			: emptyPlan(),
		processRoots.length > 0 && processPolicy
			? planProcessReferences({
					roots: processRoots,
					sourceQuery,
					destinationQuery,
					policy: processPolicy,
				})
			: emptyPlan(),
	])
	return {
		references: plans.flatMap((plan) => plan.references),
		leaveOut: new Set(plans.flatMap((plan) => [...plan.leaveOut])),
		edits: plans.flatMap((plan) => plan.edits),
		warnings: plans.flatMap((plan) => plan.warnings),
	}
}

/** A plan deciding nothing: what a half of `planReferences` with no root of its kind gives. */
function emptyPlan(): ReferencePlan {
	return { references: [], leaveOut: new Set(), edits: [], warnings: [] }
}

/** The IED half of `planReferences`: the references the IED roots make. */
async function planIedReferences(
	params: PlanReferencesParams & { policy: ReferencePolicy },
): Promise<ReferencePlan> {
	const { roots, sourceQuery, destinationQuery, policy } = params
	const ieds = await sourceQuery.getRecordsByTagName('IED')
	const iedById = new Map(ieds.map((ied) => [ied.id, ied] as const))
	const wholeRoots = roots.filter((root) => root.depth === 'whole')
	const interfaceRoots = roots.flatMap((root) => (root.depth === 'interface' ? [root] : []))
	for (const root of interfaceRoots) {
		invariant(iedById.has(root.ref.id), {
			key: 'ELEMENT_NOT_FOUND',
			ref: root.ref,
			detail: 'planReferences: root not found',
		})
	}
	const rootRecords = await Promise.all(
		wholeRoots.map(async function readRoot(root) {
			const ied = iedById.get(root.ref.id ?? '')
			invariant(ied, {
				key: 'ELEMENT_NOT_FOUND',
				ref: root.ref,
				detail: 'planReferences: root not found',
			})
			const iedRef = root.ref as Scl.Ref<'IED'>
			return { ied, records: await readHolderRecords(sourceQuery, { iedRef }) }
		}),
	)
	const landing = await readLanding({
		destinationQuery,
		rootRecords,
		interfaceIeds: interfaceRoots.map((root) => ({
			ied: iedById.get(root.ref.id) as Scl.RawRecord<'IED'>,
			uuids: root.uuids,
		})),
	})
	const decisions = [
		...rootRecords.flatMap(function decideRoot({ records }) {
			return [
				...decideBindings({ records, landing, policy }),
				...decideNamedReferences({ records, landing, policy }),
			]
		}),
		...(await decideSupervisions({ sourceQuery, roots, policy })),
	]
	return composePlan({ decisions, rootRecords })
}

/** The records of an IED a cut reads, the document's own only (a vendor homonym stays opaque content), by tag. */
async function readHolderRecords(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'> },
): Promise<HolderRecords> {
	const {
		Inputs = [],
		ExtRef = [],
		Outputs = [],
		ExtCtrl = [],
		IEDName = [],
		ClientLN = [],
		Association = [],
		KDC = [],
		LN = [],
		LN0 = [],
		GSEControl = [],
		SampledValueControl = [],
		ReportControl = [],
	} = await query.findDescendants(params.iedRef, { collect: [...REFERENCE_HOLDER_TAGS] })
	return {
		Inputs: Inputs.filter(isNativeRecord),
		ExtRef: ExtRef.filter(isNativeRecord),
		Outputs: Outputs.filter(isNativeRecord),
		ExtCtrl: ExtCtrl.filter(isNativeRecord),
		IEDName: IEDName.filter(isNativeRecord),
		ClientLN: ClientLN.filter(isNativeRecord),
		Association: Association.filter(isNativeRecord),
		KDC: KDC.filter(isNativeRecord),
		LN: LN.filter(isNativeRecord),
		LN0: LN0.filter(isNativeRecord),
		GSEControl: GSEControl.filter(isNativeRecord),
		SampledValueControl: SampledValueControl.filter(isNativeRecord),
		ReportControl: ReportControl.filter(isNativeRecord),
	}
}

/** The IEDs the closure holds, those the destination holds beside it, and the forms naming the closure's control blocks. */
async function readLanding(params: {
	destinationQuery: Core.Query<Config>
	rootRecords: readonly { ied: Scl.RawRecord<'IED'>; records: HolderRecords }[]
	/** The interface roots: inside by their name and by the uuids they keep. */
	interfaceIeds: readonly { ied: Scl.RawRecord<'IED'>; uuids: ReadonlySet<string> }[]
}): Promise<Landing> {
	const { destinationQuery, rootRecords, interfaceIeds } = params
	const insideIeds = new Set(
		[...rootRecords, ...interfaceIeds].map(({ ied }) =>
			readAttribute({ record: ied, name: 'name' }),
		),
	)
	const destination = await destinationQuery.getRecordsByTagName('IED')
	const presentIeds = new Set(
		destination
			.map((record) => readAttribute({ record, name: 'name' }))
			.filter((name) => name !== undefined && !insideIeds.has(name)),
	)
	const insideUuids = new Set([
		...rootRecords.flatMap(({ records }) =>
			uuidsOf(UUID_TARGET_TAGS.flatMap((tag): readonly Core.AnyRawRecord[] => records[tag])),
		),
		...interfaceIeds.flatMap(({ uuids }) => [...uuids]),
	])
	const destinationRoot = await destinationQuery.getRoot()
	const destinationTargets = await destinationQuery.findDescendants(destinationRoot, {
		collect: [...UUID_TARGET_TAGS],
	})
	const presentUuids = new Set(
		uuidsOf(
			UUID_TARGET_TAGS.flatMap(
				(tag): readonly Core.AnyRawRecord[] => destinationTargets[tag] ?? [],
			),
		).filter((uuid) => !insideUuids.has(uuid)),
	)
	return { insideIeds, presentIeds, insideUuids, presentUuids }
}

/** The uuids the records carry. */
function uuidsOf(records: readonly Core.AnyRawRecord[]): string[] {
	return records.flatMap((record) => {
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		return uuid ? [uuid] : []
	})
}

/** The class of a reference naming its target by uuid only: a logical node or control block of the closure, of the destination, or of none. */
function classOfUuid(params: { uuids: readonly string[]; landing: Landing }): ReferenceClass {
	const { uuids, landing } = params
	if (uuids.every((uuid) => landing.insideUuids.has(uuid))) return 'inside'
	return uuids.every((uuid) => landing.insideUuids.has(uuid) || landing.presentUuids.has(uuid))
		? 'present'
		: 'absent'
}

/** The class of a reference naming an IED by its name: the IED itself (or relative to it), one of the destination, or none. */
function classOfIedName(params: { iedName: string; landing: Landing }): ReferenceClass {
	const { iedName, landing } = params
	if (iedName === IED_RELATIVE_PREFIX || landing.insideIeds.has(iedName)) return 'inside'
	return landing.presentIeds.has(iedName) ? 'present' : 'absent'
}

/** Inputs and outputs bound to an IED by name: classified, then kept or reduced; unbound ones name nothing. */
function decideBindings(params: {
	records: HolderRecords
	landing: Landing
	policy: ReferencePolicy
}): Decision[] {
	const { records, landing, policy } = params
	const bound = [
		...records.ExtRef.map((record) => ({ record, family: 'input' as const })),
		...records.ExtCtrl.map((record) => ({ record, family: 'output' as const })),
	]
	return bound.flatMap(function decideBinding({ record, family }) {
		const iedName = readAttribute({ record, name: 'iedName', defaults: 'none' })
		const uuids = (family === 'input' ? INPUT_UUID_ATTRIBUTES : OUTPUT_UUID_ATTRIBUTES).flatMap(
			(name) => {
				const uuid = readAttribute({ record, name, defaults: 'none' })
				return uuid ? [uuid] : []
			},
		)
		if (!iedName && uuids.length === 0) return []
		const referenceClass = iedName
			? classOfIedName({ iedName, landing })
			: classOfUuid({ uuids, landing })
		const action = policy[family][referenceClass]
		assertBindingAction({ record, family, action })
		return [
			decisionOf({
				record,
				family,
				direction: 'outgoing',
				referenceClass,
				...(iedName ? { iedName } : {}),
				action,
			}),
		]
	})
}

/** The standard's limits on inputs and outputs: an input with an internal address is never left out, an output never. */
function assertBindingAction(params: {
	record: Core.AnyRawRecord
	family: 'input' | 'output'
	action: ReferenceAction
}): void {
	const { record, family, action } = params
	const hasInternalAddress = Boolean(
		readAttribute({ record, name: INTERNAL_ADDRESS, defaults: 'none' }),
	)
	invariant(action !== 'remove' || (family === 'input' && !hasInternalAddress), {
		key: 'ASSERTION_FAILED',
		detail: `planReferences: an ${family === 'input' ? 'input with an internal address' : 'output'} is never left out`,
	})
}

/** Receivers and report clients on the IED's control blocks, associations and key distribution entries naming an IED. */
function decideNamedReferences(params: {
	records: HolderRecords
	landing: Landing
	policy: ReferencePolicy
}): Decision[] {
	const { records, landing, policy } = params
	const named = [
		...records.IEDName.map((record) => ({
			record,
			family: 'client-list' as const,
			iedName: record.value,
		})),
		...records.ClientLN.map((record) => ({
			record,
			family: 'client-list' as const,
			iedName: readAttribute({ record, name: 'iedName' }),
		})),
		...[...records.Association, ...records.KDC].map((record) => ({
			record,
			family: 'association' as const,
			iedName: readAttribute({ record, name: 'iedName' }),
		})),
	]
	return named.flatMap(function decideNamed({ record, family, iedName }) {
		if (!iedName) return []
		const referenceClass = classOfIedName({ iedName, landing })
		const action = policy[family][referenceClass]
		invariant(family !== 'association' || action === 'keep' || action === 'keep-listed', {
			key: 'ASSERTION_FAILED',
			detail:
				'planReferences: an association or a key distribution entry is device configuration, kept',
		})
		invariant(action !== 'keep-names', {
			key: 'ASSERTION_FAILED',
			detail:
				'planReferences: only an input or an output keeps its source names without their uuids',
		})
		return [decisionOf({ record, family, direction: 'incoming', referenceClass, iedName, action })]
	})
}

/**
 * Supervising logical nodes (LGOS / LSVS) of the roots and the control block their reference names: inside when it is a
 * control block of the closure, else outside (a supervision names a control block, never an IED by itself). A blank
 * reference names nothing yet: not a reference. Their values are the device's data model: kept, at most listed. Which
 * control block a value names is answered by the dataflow's supervision index (every form a reference takes), read once.
 */
async function decideSupervisions(params: {
	sourceQuery: Core.Query<Config>
	roots: readonly ClosureRoot[]
	policy: ReferencePolicy
}): Promise<Decision[]> {
	const { sourceQuery, roots, policy } = params
	const rootIds = new Set(
		roots.flatMap((root) => (root.depth === 'whole' ? [root.ref.id ?? ''] : [])),
	)
	const interfaceControlBlocks = new Set(
		roots.flatMap((root) => (root.depth === 'interface' ? [...root.controlBlocks] : [])),
	)
	const context = createDataflowContext(sourceQuery)
	const section = await context.iedSection()
	const supervising = section.logicalNodes.filter(function isRootSupervision(node) {
		return (
			rootIds.has(node.ied.id) &&
			node.record.tagName === 'LN' &&
			SUPERVISIONS.kinds.some(
				(kind) => kind.lnClass === readAttribute({ record: node.record, name: 'lnClass' }),
			)
		)
	})
	if (supervising.length === 0) return []
	const insideValueIds = await insideSupervisionValues({
		context,
		roots,
		rootIds,
		interfaceControlBlocks,
	})
	const references = await readSupervisionReferences({
		query: sourceQuery,
		logicalNodes: supervising.map(({ record }) => record),
	})
	// the index keeps the first value of each reference: a reference is inside when the index resolves one of its values
	const insideReferences = new Set(
		references
			.filter(({ value }) => insideValueIds.has(value.id))
			.map(({ value }) => value.value ?? ''),
	)
	return references.flatMap(function decideReference({ ln, value }) {
		const reference = value.value ?? ''
		if (reference === '') return []
		const referenceClass: ReferenceClass = insideReferences.has(reference) ? 'inside' : 'absent'
		const action = policy.supervision[referenceClass]
		invariant(action === 'keep' || action === 'keep-listed', {
			key: 'ASSERTION_FAILED',
			detail: 'planReferences: a supervision is the device data model, kept',
		})
		return [
			{
				...decisionOf({
					record: ln,
					family: 'supervision',
					direction: 'outgoing',
					referenceClass,
					action,
				}),
				reference,
			},
		]
	})
}

/** The values supervising a control block of the closure (a whole root's, or one an interface root keeps), by id. */
async function insideSupervisionValues(params: {
	context: ReturnType<typeof createDataflowContext>
	roots: readonly ClosureRoot[]
	rootIds: ReadonlySet<string>
	interfaceControlBlocks: ReadonlySet<string>
}): Promise<ReadonlySet<string>> {
	const { context, roots, rootIds, interfaceControlBlocks } = params
	const section = await context.iedSection()
	const index = await context.supervisionIndex()
	return new Set(
		[...section.controlBlocks.values()]
			.filter(
				(controlBlock) =>
					rootIds.has(controlBlock.ied.id) || interfaceControlBlocks.has(controlBlock.record.id),
			)
			.flatMap((controlBlock) =>
				roots.flatMap((root) => {
					if (root.depth !== 'whole') return []
					const supervision = index.supervisionOf({
						controlBlock,
						subscriber: root.ref as Scl.Ref<'IED'>,
					})
					return supervision ? [supervision.val.id] : []
				}),
			),
	)
}

/** The reference values of supervising logical nodes: their data object, its reference attribute, its values, one read per level. */
async function readSupervisionReferences(params: {
	query: Core.Query<Config>
	logicalNodes: readonly Core.AnyRawRecord[]
}): Promise<{ ln: Core.AnyRawRecord; value: Core.AnyRawRecord }[]> {
	const { query, logicalNodes } = params
	const dataObjectsOfEach = await query.any.getChildrenOfEach(logicalNodes, { tagName: 'DOI' })
	const dataObjects = logicalNodes.flatMap((ln, position) => {
		const kind = SUPERVISIONS.kinds.find(
			(candidate) => candidate.lnClass === readAttribute({ record: ln, name: 'lnClass' }),
		)
		return (dataObjectsOfEach[position] ?? [])
			.filter((doi) => readAttribute({ record: doi, name: 'name' }) === kind?.dataObject)
			.map((doi) => ({ ln, doi }))
	})
	if (dataObjects.length === 0) return []
	const attributesOfEach = await query.any.getChildrenOfEach(
		dataObjects.map(({ doi }) => doi),
		{ tagName: 'DAI' },
	)
	const attributes = dataObjects.flatMap(({ ln }, position) =>
		(attributesOfEach[position] ?? [])
			.filter((dai) => readAttribute({ record: dai, name: 'name' }) === SUPERVISIONS.attribute)
			.map((dai) => ({ ln, dai })),
	)
	if (attributes.length === 0) return []
	const valuesOfEach = await query.any.getChildrenOfEach(
		attributes.map(({ dai }) => dai),
		{ tagName: 'Val' },
	)
	return attributes.flatMap(({ ln }, position) =>
		(valuesOfEach[position] ?? []).map((value) => ({ ln, value })),
	)
}

function groupByParent<Record_ extends Core.AnyRawRecord>(
	records: readonly Record_[],
): Map<string, Record_[]> {
	const grouped = new Map<string, Record_[]>()
	for (const record of records) {
		if (!record.parent) continue
		grouped.set(record.parent.id, [...(grouped.get(record.parent.id) ?? []), record])
	}
	return grouped
}

function decisionOf(params: {
	record: Core.AnyRawRecord
	family: ReferenceFamily
	direction: 'outgoing' | 'incoming'
	referenceClass: ReferenceClass
	iedName?: string
	action: ReferenceAction
}): Decision {
	const { record, family, direction, referenceClass, iedName, action } = params
	return {
		record,
		holder: { ...toRef(record), id: record.id } as Scl.Ref<Scl.ElementsOf>,
		family,
		direction,
		class: referenceClass,
		...(iedName === undefined ? {} : { iedName }),
		action,
	}
}

/** The decisions as the plan: the left-out records (and the wrappers they empty), the attribute edits, the warnings. */
function composePlan(params: {
	decisions: readonly (Decision & { reference?: string })[]
	rootRecords: readonly { records: HolderRecords }[]
}): ReferencePlan {
	const { decisions, rootRecords } = params
	const contributions = decisions.map(contributionOf)
	const leaveOut = new Set(contributions.flatMap((contribution) => contribution.leaveOut))
	const emptied = rootRecords.flatMap(({ records }) => emptiedWrappers({ records, leaveOut }))
	return {
		references: decisions.map(withoutRecord),
		leaveOut: new Set([...leaveOut, ...emptied]),
		edits: contributions.flatMap((contribution) => contribution.edits),
		warnings: contributions.flatMap((contribution) => contribution.warnings),
	}
}

/** What one decision adds to the plan: by its family, what its holder loses, the edits it makes, what it says. */
function contributionOf(decision: Decision & { reference?: string }): PlanContribution {
	const { record, family } = decision
	// an input or output naming its source by uuid only has no names to keep: it is reduced instead
	const action =
		decision.action === 'keep-names' && decision.iedName === undefined ? 'reduce' : decision.action
	if (action === 'keep') return { leaveOut: [], edits: [], warnings: [] }
	if (family === 'supervision') {
		return {
			leaveOut: [],
			edits: [],
			warnings: [
				{
					code: 'supervision-source-absent',
					source: { tagName: 'LN', id: record.id },
					reference: decision.reference ?? '',
				},
			],
		}
	}
	if (family === 'input' || family === 'output') {
		return bindingContribution({ decision, family, action })
	}
	return namedContribution({ decision, action })
}

/**
 * An input or output naming what the file does not hold: left out (an input without internal address reduced, or
 * removed), written with its signal names only (`keep-names`), written as it is and listed (`keep-listed`), or written
 * without its source (`reduce`).
 */
function bindingContribution(params: {
	decision: Decision
	family: 'input' | 'output'
	action: ReferenceAction
}): PlanContribution {
	const { decision, family, action } = params
	const { record } = decision
	const ref = { tagName: record.tagName, id: record.id } as Scl.Ref<'ExtRef' | 'ExtCtrl'>
	const named = decision.iedName === undefined ? {} : { iedName: decision.iedName }
	const hasInternalAddress = Boolean(
		readAttribute({ record, name: INTERNAL_ADDRESS, defaults: 'none' }),
	)
	if (action === 'remove' || (action === 'reduce' && family === 'input' && !hasInternalAddress)) {
		return {
			leaveOut: [record.id],
			edits: [],
			warnings: [{ code: 'input-removed', source: ref as Scl.Ref<'ExtRef'>, ...named }],
		}
	}
	if (action === 'keep-names') {
		return {
			leaveOut: [],
			edits: [{ ref, attributes: clearedSourceReferences({ record, family }) }],
			warnings: [{ code: 'external-input', source: ref, ...named }],
		}
	}
	if (action === 'keep-listed') {
		return {
			leaveOut: [],
			edits: [],
			warnings: [{ code: 'input-bound-outside', source: ref, ...named }],
		}
	}
	const reduction = reduceBinding({ record, family })
	return {
		leaveOut: [],
		edits: [{ ref, attributes: reduction.cleared }],
		warnings: [
			{ code: 'input-unbound', source: ref, ...named, attributes: Object.keys(reduction.cleared) },
			...(reduction.missing.length > 0
				? [
						{
							code: 'input-incomplete' as const,
							source: ref as Scl.Ref<'ExtRef'>,
							missing: reduction.missing,
						},
					]
				: []),
		],
	}
}

/** A receiver, report client, association or key distribution entry naming an IED: left out and said, or kept and said. */
function namedContribution(params: {
	decision: Decision
	action: ReferenceAction
}): PlanContribution {
	const { decision, action } = params
	const { record } = decision
	const source = { tagName: record.tagName, id: record.id } as Scl.Ref<
		'IEDName' | 'ClientLN' | 'Association' | 'KDC'
	>
	const iedName = decision.iedName ?? ''
	return action === 'remove'
		? {
				leaveOut: [record.id],
				edits: [],
				warnings: [
					{
						code: 'ied-reference-left-out',
						source: source as Scl.Ref<'IEDName' | 'ClientLN'>,
						iedName,
					},
				],
			}
		: { leaveOut: [], edits: [], warnings: [{ code: 'ied-reference-dangling', source, iedName }] }
}

/**
 * What an input or output naming an IED the file does not hold loses, those it holds cleared: the uuids it names its
 * source by and, for an input, the control block it names; its signal names stay.
 */
function clearedSourceReferences(params: ClearedSourceReferencesParams): Record<string, undefined> {
	const { record, family } = params
	const names =
		family === 'input'
			? [...INPUT_UUID_ATTRIBUTES, ...INPUT_CONTROL_BLOCK_NAME_ATTRIBUTES]
			: OUTPUT_UUID_ATTRIBUTES
	return Object.fromEntries(
		names.flatMap(function heldUuid(name) {
			return readAttribute({ record, name, defaults: 'none' }) ? [[name, undefined]] : []
		}),
	)
}

/** An input or output written without its source: the attributes it holds of that source cleared, what it then lacks. */
function reduceBinding(params: { record: Core.AnyRawRecord; family: 'input' | 'output' }): {
	cleared: Record<string, undefined>
	missing: string[]
} {
	const { record, family } = params
	const attributes = readAttributes({ record, defaults: 'none' }) as Record<
		string,
		string | undefined
	>
	const sourceAttributes = family === 'input' ? INPUT_SOURCE_ATTRIBUTES : OUTPUT_SOURCE_ATTRIBUTES
	const cleared = Object.fromEntries(
		sourceAttributes
			.filter((name) => attributes[name] !== undefined)
			.map((name) => [name, undefined]),
	)
	const missing =
		family === 'input' ? INPUT_LATER_BINDING_NEEDS.filter((name) => !attributes[name]) : []
	return { cleared, missing }
}

/** The `Inputs` and `Outputs` whose every child the cut leaves out: left out with them (each holds at least one). */
function emptiedWrappers(params: {
	records: HolderRecords
	leaveOut: ReadonlySet<string>
}): string[] {
	const { records, leaveOut } = params
	const children = groupByParent([...records.ExtRef, ...records.ExtCtrl])
	return [...records.Inputs, ...records.Outputs]
		.filter(function isEmptied(wrapper) {
			const held = children.get(wrapper.id) ?? []
			return held.length > 0 && held.every((child) => leaveOut.has(child.id))
		})
		.map((wrapper) => wrapper.id)
}

function withoutRecord(decision: Decision): ClassifiedReference {
	const { record: _record, ...classified } = decision
	return classified
}
