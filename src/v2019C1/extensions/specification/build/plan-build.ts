import { normalizeLdInst, prefixWithLevel } from '../naming/normalize-ld-inst'
import {
	LD_INST_PATTERN,
	LN_INST_PATTERN,
	LN_PREFIX_MAX,
	LN_PREFIX_PATTERN,
} from '../naming/normalize-ld-inst.constants'
import { planValues } from '../query/plan-values'
import {
	ADDED_LPHD,
	LDEVICE_NAME_MAX,
	LN_DERIVED_NAME_MAX,
	LN_PREFIX_INST_MAX,
	LN0_IDENTITY,
} from '../transaction/build-ied.constants'
import { FUNCTION_LIKES, PROCESS_ROOTS, SUB_FUNCTIONS } from './build.constants'

import { readAttributes } from '@/v2019C1/helpers'

import type {
	BuildRefusal,
	IedBuildPlan,
	LnTypeContext,
	LNodeContainerTag,
	OpenValueUsed,
	PlannedAddition,
	PlannedLogicalNode,
} from '../transaction/build-ied.types'
import type { BuildInput, RequestedLNode, SectionElement, TargetLDevice } from './build-input.types'
import type { BuildOptions, ContainerName, LDeviceDraft, LDeviceSource } from './plan-build.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The plan of a build, from what was read: pure, so the query and the transaction make the same one. Every refusal is
 * collected (in this order: LNodes outside the process section, logical device names, logical node names and types,
 * the types of the added LN0 and LPHD); the values the caller's rules gave are listed in the same order.
 */
export function planBuild(params: { input: BuildInput; options: BuildOptions }): IedBuildPlan {
	const { input, options } = params
	const empty: IedBuildPlan = {
		lDevices: [],
		logicalNodes: [],
		added: [],
		leftOut: [],
		openValuesUsed: [],
		values: [],
		valuesLeftOut: [],
		refusals: [],
	}
	const targetRefusal = refuseTarget({ input, options })
	if (targetRefusal) return { ...empty, refusals: [targetRefusal] }

	const refusals: BuildRefusal[] = []
	const leftOut: IedBuildPlan['leftOut'] = []
	const existing: RequestedLNode[] = []
	const fresh: RequestedLNode[] = []
	for (const lnode of input.lnodes) {
		if (!lnode.section || !inProcessSection(lnode.section)) {
			refusals.push({
				reason: 'lnode-outside-process',
				ref: lnode.ref,
				detail: 'the LNode is not in a substation, line or process',
			})
		} else if (lnode.implementation && lnode.implementation.ied.id !== input.ied.ref.id) {
			leftOut.push({
				lnode: lnode.ref,
				reason: 'implemented-elsewhere',
				ied: lnode.implementation.ied,
			})
		} else if (lnode.implementation) existing.push(lnode)
		else fresh.push(lnode)
	}

	const built = planExisting({ input, existing })
	const known = new Map(built.lDevices.map((lDevice) => [lDevice.inst, lDevice]))
	const named = nameLDevices({ input, options, lnodes: fresh, known })
	refusals.push(...named.refusals)
	const lDevices = new Map([
		...known,
		...named.lDevices.map((lDevice) => [lDevice.inst, lDevice] as const),
	])
	const logicalNodes: PlannedLogicalNode[] = [...built.logicalNodes]
	const lnodeTypes: OpenValueUsed[] = []
	const requested: { inst: string; lnClass: string }[] = []
	for (const lnode of fresh) {
		const inst = named.instOf.get(lnode.ref.id)
		if (inst === undefined) continue
		const planned = planLogicalNode({ input, options, lnode, inst, logicalNodes, lDevices })
		requested.push({ inst, lnClass: lnClassOf({ lnode }) })
		refusals.push(...planned.refusals)
		lnodeTypes.push(...planned.openValuesUsed)
		if (planned.logicalNode) logicalNodes.push(planned.logicalNode)
	}

	const additions = planAdditions({ input, options, lDevices, logicalNodes, requested })
	const valuesPlanned = planValues({
		logicalNodes,
		specifiedValues: input.specifiedValues,
		heldValues: input.heldValues,
		valueTypes: input.valueTypes,
		contextTypeIds: new Set(
			input.types.filter((type) => !type.inTargetDocument).map((type) => type.id),
		),
		excludeFunctionalConstraints: options.excludeFunctionalConstraints,
	})
	refusals.push(...additions.refusals)
	return {
		lDevices: [...lDevices.values()].map(({ inst, from, existing: built }) => ({
			inst,
			from,
			...(built && { existing: built }),
		})),
		logicalNodes,
		added: additions.added,
		leftOut,
		openValuesUsed: [...named.openValuesUsed, ...lnodeTypes, ...additions.openValuesUsed],
		values: valuesPlanned.values,
		valuesLeftOut: valuesPlanned.valuesLeftOut,
		refusals,
	}
}

/** The refusal of the target itself: an implemented IED, or no server to build under. */
function refuseTarget(params: {
	input: BuildInput
	options: BuildOptions
}): BuildRefusal | undefined {
	const { input, options } = params
	if (input.ied.kind !== 'specification')
		return {
			reason: 'not-specification-ied',
			ref: input.ied.ref,
			detail: `${input.ied.name} is the IED of a real device`,
		}
	if (!serverOf({ input, options }))
		return {
			reason: 'server',
			ref: input.ied.ref,
			detail: options.server
				? `${input.ied.name} has no server ${options.server.id}`
				: `${input.ied.name} has ${input.servers.length} servers: name the one to build under`,
		}
	return undefined
}

/** The server the build writes under: the one given when the IED holds it, else the IED's only server. */
export function serverOf(params: {
	input: BuildInput
	options: BuildOptions
}): Scl.Ref<'Server'> | undefined {
	const { input, options } = params
	if (options.server) return input.servers.find((server) => server.id === options.server?.id)
	return input.servers.length === 1 ? input.servers[0] : undefined
}

function inProcessSection(section: SectionElement): boolean {
	return (
		section.ancestry.some((ancestor) => PROCESS_ROOTS.has(ancestor.tagName)) &&
		!section.ancestry.some((ancestor) => ancestor.tagName === 'FunctionTemplate')
	)
}

/** The LNodes the target IED already implements: their logical nodes, as they are, and the logical devices holding them. */
function planExisting(params: { input: BuildInput; existing: readonly RequestedLNode[] }): {
	lDevices: LDeviceDraft[]
	logicalNodes: PlannedLogicalNode[]
} {
	const { input, existing } = params
	const lDevices = new Map<string, LDeviceDraft>()
	const logicalNodes: PlannedLogicalNode[] = []
	for (const lnode of existing) {
		const lnId = lnode.implementation?.ln.id
		const target = input.lDevices.find((lDevice) =>
			lDevice.logicalNodes.some((logicalNode) => logicalNode.ref.id === lnId),
		)
		const logicalNode = target?.logicalNodes.find((held) => held.ref.id === lnId)
		if (!target || !logicalNode) continue
		const source = lDeviceSourceOf({ lnode })
		if (!lDevices.has(target.inst))
			lDevices.set(target.inst, {
				inst: target.inst,
				from: source.kind === 'container' ? source.ref : 'lnode-ldInst',
				existing: target.ref,
				element: source.ref,
				target,
			})
		logicalNodes.push({
			lnode: lnode.ref,
			lDeviceInst: target.inst,
			kind: logicalNode.ref.tagName === 'LN0' ? 'LN0' : 'LN',
			identity: logicalNode.identity,
			lnType: logicalNode.lnType,
			existing: logicalNode.ref,
		})
	}
	return { lDevices: [...lDevices.values()], logicalNodes }
}

/** Where an LNode's logical device comes from (the `ldInst` it names wins over its function). */
function lDeviceSourceOf(params: { lnode: RequestedLNode }): LDeviceSource {
	const { lnode } = params
	const { ldInst } = readAttributes({ record: lnode.record, defaults: 'none' })
	const section = lnode.section as SectionElement
	const container = containerOf({ element: section })
	const containerKey = keyOf({ element: container.element })
	if (ldInst && !lnode.implementation)
		return {
			kind: 'ldInst',
			key: `ldInst:${ldInst}@${containerKey}`,
			inst: ldInst,
			ref: lnode.ref,
			containerKey,
		}
	return {
		kind: 'container',
		key: containerKey,
		container: container.element,
		ref: {
			tagName: container.element.record.tagName as LNodeContainerTag,
			id: container.element.record.id,
		},
		outsideFunction: container.outsideFunction,
	}
}

/**
 * The element whose logical device an LNode lands in: its nearest function or equipment function, or non-leaf
 * subfunction; else the element holding it, which no function-like is.
 */
function containerOf(params: { element: SectionElement }): {
	element: SectionElement
	outsideFunction: boolean
} {
	const { ancestry } = params.element
	for (let level = ancestry.length - 1; level >= 0; level--) {
		const record = ancestry[level] as AnyRawRecord
		if (isLDeviceSource({ record }))
			return { element: { record, ancestry: ancestry.slice(0, level) }, outsideFunction: false }
	}
	const parent = ancestry.length - 1
	return {
		element: { record: ancestry[parent] as AnyRawRecord, ancestry: ancestry.slice(0, parent) },
		outsideFunction: true,
	}
}

/** A function or equipment function, or a subfunction holding subfunctions. */
function isLDeviceSource(params: { record: AnyRawRecord }): boolean {
	const { record } = params
	if (!FUNCTION_LIKES.has(record.tagName)) return false
	if (!SUB_FUNCTIONS.has(record.tagName)) return true
	return record.children.some((child) => SUB_FUNCTIONS.has(child.tagName))
}

/** An element's place in the process section, by tag and name from its root: the same in every document. */
function keyOf(params: { element: SectionElement }): string {
	const { record, ancestry } = params.element
	return [...ancestry, record]
		.filter((step) => step.tagName !== 'SCL')
		.map((step) => `${step.tagName}:${nameOf({ record: step })}`)
		.join('/')
}

function nameOf(params: { record: AnyRawRecord }): string {
	return readAttributes({ record: params.record, defaults: 'none' }).name ?? ''
}

/**
 * The logical device of each new LNode (and the logical devices the plan does not know yet): its `ldInst`, else its container's name, normalised, clashes decided over the
 * context document's function-likes, the `ldInst` rule's answers judged like the engine's names; each checked against
 * the target's logical devices (never two functions in one).
 */
function nameLDevices(params: {
	input: BuildInput
	options: BuildOptions
	lnodes: readonly RequestedLNode[]
	known: ReadonlyMap<string, LDeviceDraft>
}): {
	instOf: Map<string, string>
	lDevices: LDeviceDraft[]
	refusals: BuildRefusal[]
	openValuesUsed: OpenValueUsed[]
} {
	const { input, options, lnodes, known } = params
	const lDevices = new Map<string, LDeviceDraft>()
	const sources = new Map<string, LDeviceSource>()
	const sourceOfLNode = new Map<string, LDeviceSource>()
	for (const lnode of lnodes) {
		const source = lDeviceSourceOf({ lnode })
		sourceOfLNode.set(lnode.ref.id, source)
		if (!sources.has(source.key)) sources.set(source.key, source)
	}
	const containers = [...sources.values()].flatMap((source) =>
		source.kind === 'container' ? [source] : [],
	)
	const names = nameContainers({ input, options, containers })

	const refusals: BuildRefusal[] = []
	const openValuesUsed: OpenValueUsed[] = []
	const instOfSource = new Map<string, string>()
	for (const source of sources.values()) {
		const checked = checkSource({ input, options, source, names })
		const sharedAcross =
			source.kind === 'ldInst' &&
			[...sources.values()].some(
				(other) =>
					other.kind === 'ldInst' &&
					other.inst === source.inst &&
					other.containerKey !== source.containerKey,
			)
		const perLNode: BuildRefusal | undefined = sharedAcross
			? {
					reason: 'ld-name',
					detail: `the LNodes of several elements name the logical device ${source.inst}`,
				}
			: checked.refusal?.reason === 'no-function'
				? checked.refusal
				: undefined
		if (perLNode) {
			refusals.push(
				...lnodes
					.filter((lnode) => sourceOfLNode.get(lnode.ref.id)?.key === source.key)
					.map((lnode) => ({ ...perLNode, ref: lnode.ref })),
			)
			continue
		}
		if (checked.refusal) {
			refusals.push(checked.refusal)
			continue
		}
		const inst = checked.inst as string
		const ownerKey = source.kind === 'container' ? source.key : source.containerKey
		const namesAnother =
			source.kind === 'ldInst' &&
			[...names].some(([key, name]) => key !== ownerKey && name.inst === inst)
		if (namesAnother) {
			refusals.push({
				reason: 'ld-name',
				ref: source.ref,
				detail: `${inst} is the logical device of another element of the document`,
			})
			continue
		}
		const target = input.lDevices.find((lDevice) => lDevice.inst === inst)
		const mixed = target && holdsAnotherContainer({ input, target, ownerKey })
		if (mixed) {
			refusals.push({
				reason: 'ld-name',
				ref: source.ref,
				detail: `${input.ied.name} already holds a logical device ${inst} built from another element`,
			})
			continue
		}
		if (checked.answered) openValuesUsed.push({ point: 'ldInst', element: source.ref, value: inst })
		instOfSource.set(source.key, inst)
		if (!known.has(inst) && !lDevices.has(inst))
			lDevices.set(inst, {
				inst,
				from: source.kind === 'container' ? source.ref : 'lnode-ldInst',
				...(target && { existing: target.ref }),
				element: source.ref,
				...(target && { target }),
			})
	}
	const instOf = new Map<string, string>()
	for (const [lnodeId, source] of sourceOfLNode) {
		const inst = instOfSource.get(source.key)
		if (inst !== undefined) instOf.set(lnodeId, inst)
	}
	return { instOf, lDevices: [...lDevices.values()], refusals, openValuesUsed }
}

/** The name of every container that may clash, and of the build's containers outside any function. */
function nameContainers(params: {
	input: BuildInput
	options: BuildOptions
	containers: readonly Extract<LDeviceSource, { kind: 'container' }>[]
}): Map<string, ContainerName> {
	const { input, options, containers } = params
	const askLdInst = options.openValues.ldInst
	const buildByKey = new Map(containers.map((source) => [source.key, source]))
	const members = input.clashSet
		.filter((element) => isLDeviceSource({ record: element.record }))
		.map(function memberOf(element) {
			const key = keyOf({ element })
			const ref = buildByKey.get(key)?.ref ?? {
				tagName: element.record.tagName as LNodeContainerTag,
				id: element.record.id,
			}
			return { key, element, ref, outsideFunction: false }
		})
	const memberKeys = new Set(members.map((member) => member.key))
	const outside = containers
		.filter((source) => !memberKeys.has(source.key))
		.map((source) => ({
			key: source.key,
			element: source.container,
			ref: source.ref,
			outsideFunction: source.outsideFunction,
		}))

	const first = [...members, ...outside].map(function firstNameOf(member) {
		const name = nameOf({ record: member.element.record })
		const derived = member.outsideFunction ? '' : normalizeLdInst({ name })
		const answer = askLdInst?.({
			container: member.ref,
			containerName: name,
			...(derived && { derived }),
		})
		return { ...member, name, inst: answer ?? derived, answered: answer !== undefined }
	})
	const firstGroups = Map.groupBy(
		first.filter((member) => member.inst !== ''),
		(member) => member.inst,
	)
	const second = first.map(function secondNameOf(member) {
		const clashing = (firstGroups.get(member.inst)?.length ?? 0) > 1 && member.inst !== ''
		if (!clashing || member.answered) return { ...member, clashes: clashing }
		const level = nameOf({ record: member.element.ancestry.at(-1) as AnyRawRecord })
		return { ...member, inst: prefixWithLevel({ level, name: member.name }), clashes: false }
	})
	const secondGroups = Map.groupBy(
		second.filter((member) => member.inst !== ''),
		(member) => member.inst,
	)
	return new Map(
		second.map((member) => [
			member.key,
			{
				inst: member.inst,
				answered: member.answered,
				clashes: member.clashes || (secondGroups.get(member.inst)?.length ?? 0) > 1,
			},
		]),
	)
}

/** One source's logical device name, or why it is refused. */
function checkSource(params: {
	input: BuildInput
	options: BuildOptions
	source: LDeviceSource
	names: ReadonlyMap<string, ContainerName>
}): { inst?: string; answered?: boolean; refusal?: BuildRefusal } {
	const { input, options, source, names } = params
	const longest = longestIedName({ name: input.ied.name, alsoFits: options.ldNameAlsoFits })
	const name: ContainerName =
		source.kind === 'ldInst'
			? { inst: source.inst, answered: false, clashes: false }
			: (names.get(source.key) ?? { inst: '', answered: false, clashes: false })
	function refuse(reason: BuildRefusal['reason'], detail: string): { refusal: BuildRefusal } {
		return { refusal: { reason, ref: source.ref, detail } }
	}
	if (source.kind === 'container' && source.outsideFunction && !name.answered)
		return refuse(
			'no-function',
			'the LNode is in no function and no ldInst rule names its logical device',
		)
	const tooLong = longest.length + name.inst.length > LDEVICE_NAME_MAX
	if (name.answered && (!LD_INST_PATTERN.test(name.inst) || tooLong))
		return refuse(
			'open-value-invalid',
			`the ldInst rule answered "${name.inst}", not a logical device name of ${input.ied.name}`,
		)
	if (name.inst === '') return refuse('ld-name', 'nothing is left of the name once normalised')
	if (name.clashes) return refuse('ld-name', `${name.inst} names another logical device too`)
	if (tooLong) return refuse('ld-name', `${longest}${name.inst} is longer than ${LDEVICE_NAME_MAX}`)
	if (!LD_INST_PATTERN.test(name.inst))
		return refuse('ld-name', `${name.inst} is not a logical device name`)
	return { inst: name.inst, answered: name.answered }
}

/** The longest of the IED's name and the other names its logical device names must fit. */
function longestIedName(params: { name: string; alsoFits: readonly string[] }): string {
	return [params.name, ...params.alsoFits].reduce((longest, name) =>
		name.length > longest.length ? name : longest,
	)
}

/** A target logical device holding a logical node bound (by uuid or by its names) from an LNode of another element. */
function holdsAnotherContainer(params: {
	input: BuildInput
	target: TargetLDevice
	ownerKey: string
}): boolean {
	const { input, target, ownerKey } = params
	return target.logicalNodes.some(function boundElsewhere(logicalNode) {
		const lnode = input.boundLNodeOf.get(logicalNode.ref.id)
		if (!lnode) return false
		return keyOf({ element: containerOf({ element: lnode }).element }) !== ownerKey
	})
}

/** The logical node a new LNode becomes, or why it cannot. */
function planLogicalNode(params: {
	input: BuildInput
	options: BuildOptions
	lnode: RequestedLNode
	inst: string
	logicalNodes: readonly PlannedLogicalNode[]
	lDevices: ReadonlyMap<string, LDeviceDraft>
}): {
	logicalNode?: PlannedLogicalNode
	refusals: BuildRefusal[]
	openValuesUsed: OpenValueUsed[]
} {
	const { input, options, lnode, inst, logicalNodes, lDevices } = params
	const named = identityOf({ options, lnode })
	if ('refusal' in named) return { refusals: [named.refusal], openValuesUsed: [] }
	const { identity, kind } = named
	const target = lDevices.get(inst)?.target
	const taken =
		logicalNodes.some(
			(planned) => planned.lDeviceInst === inst && sameLogicalNode({ kind, identity, planned }),
		) ||
		(target?.logicalNodes.some((held) =>
			sameLogicalNode({
				kind,
				identity,
				planned: { kind: held.ref.tagName === 'LN0' ? 'LN0' : 'LN', identity: held.identity },
			}),
		) ??
			false)
	if (taken)
		return {
			refusals: [
				{
					reason: 'ln-collision',
					ref: lnode.ref,
					detail: `logical device ${inst} already holds ${identity.prefix}${identity.lnClass}${identity.inst}`,
				},
			],
			openValuesUsed: [],
		}
	const typed = lnTypeOf({ input, options, lnode, kind, lnClass: identity.lnClass })
	if (typed.refusal) return { refusals: [typed.refusal], openValuesUsed: [] }
	return {
		logicalNode: {
			lnode: lnode.ref,
			lDeviceInst: inst,
			kind,
			identity,
			lnType: typed.lnType as string,
		},
		refusals: [],
		openValuesUsed: typed.used ? [typed.used] : [],
	}
}

function sameLogicalNode(params: {
	kind: 'LN0' | 'LN'
	identity: PlannedLogicalNode['identity']
	planned: Pick<PlannedLogicalNode, 'kind' | 'identity'>
}): boolean {
	const { kind, identity, planned } = params
	if (kind === 'LN0' || planned.kind === 'LN0') return kind === planned.kind
	return (
		planned.identity.prefix === identity.prefix &&
		planned.identity.lnClass === identity.lnClass &&
		planned.identity.inst === identity.inst
	)
}

/** The identity of the logical node an LNode becomes, its prefix from a leaf subfunction on request. */
function identityOf(params: {
	options: BuildOptions
	lnode: RequestedLNode
}): { kind: 'LN0' | 'LN'; identity: PlannedLogicalNode['identity'] } | { refusal: BuildRefusal } {
	const { options, lnode } = params
	const attributes = readAttributes({ record: lnode.record, defaults: 'none' })
	const lnClass = attributes.lnClass ?? ''
	const ownPrefix = attributes.prefix ?? ''
	const lnInst = attributes.lnInst ?? ''
	function refuse(detail: string): { refusal: BuildRefusal } {
		return { refusal: { reason: 'ln-name', ref: lnode.ref, detail } }
	}
	if (lnClass === LN0_IDENTITY.lnClass) {
		if (ownPrefix !== '') return refuse('an LLN0 has no prefix')
		return { kind: 'LN0', identity: { ...LN0_IDENTITY } }
	}
	if (!LN_INST_PATTERN.test(lnInst)) return refuse(`"${lnInst}" is not a logical node instance`)
	const leaf =
		options.prefixFromLeafSubFunction && ownPrefix === '' ? leafNameOf({ lnode }) : undefined
	if (leaf !== undefined) {
		const prefix = normalizeLdInst({ name: leaf })
		const fits =
			LN_PREFIX_PATTERN.test(prefix) &&
			prefix.length <= LN_PREFIX_MAX &&
			prefix.length + lnClass.length + lnInst.length <= LN_DERIVED_NAME_MAX
		if (!fits) return refuse(`the subfunction ${leaf} does not fit as a prefix`)
		return { kind: 'LN', identity: { prefix, lnClass, inst: lnInst } }
	}
	if (ownPrefix.length + lnInst.length > LN_PREFIX_INST_MAX)
		return refuse(`the prefix and instance are longer than ${LN_PREFIX_INST_MAX}`)
	return { kind: 'LN', identity: { prefix: ownPrefix, lnClass, inst: lnInst } }
}

function lnClassOf(params: { lnode: RequestedLNode }): string {
	return readAttributes({ record: params.lnode.record, defaults: 'none' }).lnClass ?? ''
}

/** The name of the leaf subfunction holding the LNode directly, when one does. */
function leafNameOf(params: { lnode: RequestedLNode }): string | undefined {
	const parent = params.lnode.section?.ancestry.at(-1)
	if (!parent || !SUB_FUNCTIONS.has(parent.tagName) || isLDeviceSource({ record: parent }))
		return undefined
	return nameOf({ record: parent })
}

/** The LNode's own type, checked; else the `lnType` rule's answer, judged. */
function lnTypeOf(params: {
	input: BuildInput
	options: BuildOptions
	lnode: RequestedLNode
	kind: 'LN0' | 'LN'
	lnClass: string
}): { lnType?: string; used?: OpenValueUsed; refusal?: BuildRefusal } {
	const { input, options, lnode, lnClass } = params
	const { lnType } = readAttributes({ record: lnode.record, defaults: 'none' })
	if (lnType) {
		const type = input.types.find((candidate) => candidate.id === lnType)
		if (!type)
			return {
				refusal: {
					reason: 'type-missing',
					ref: lnode.ref,
					detail: `no LNodeType ${lnType} (a broken reference)`,
				},
			}
		if (type.lnClass !== lnClass)
			return {
				refusal: {
					reason: 'type-mismatch',
					ref: lnode.ref,
					detail: `${lnType} is of class ${type.lnClass}, not ${lnClass}`,
				},
			}
		return { lnType }
	}
	return askLnType({
		input,
		options,
		context: { kind: params.kind === 'LN0' ? 'LN0' : 'LN', lnClass, lnode: lnode.ref },
		element: lnode.ref,
	})
}

/** The `lnType` rule's answer for an open type, judged: one of the candidates of the class. */
function askLnType(params: {
	input: BuildInput
	options: BuildOptions
	context: Omit<LnTypeContext, 'candidates'>
	element: Scl.Ref<Scl.ElementsOf>
}): { lnType?: string; used?: OpenValueUsed; refusal?: BuildRefusal } {
	const { input, options, context, element } = params
	const ofClass = input.types.filter((type) => type.lnClass === context.lnClass)
	const candidates = ofClass.map((type) => ({
		id: type.id,
		inTargetIed: input.targetIedTypes.has(type.id),
	}))
	const answer = options.openValues.lnType?.({ ...context, candidates })
	if (answer === undefined)
		return {
			refusal: {
				reason: 'type-missing',
				ref: element,
				detail: `no type for the ${context.kind} ${context.lnClass}: the standard names none and no lnType rule answers`,
			},
		}
	const chosen = ofClass.find((type) => type.id === answer)
	if (!chosen)
		return {
			refusal: {
				reason: 'open-value-invalid',
				ref: element,
				detail: `the lnType rule answered "${answer}", not a type of class ${context.lnClass}`,
			},
		}
	return { lnType: answer, used: { point: 'lnType', element, value: answer } }
}

/** The LN0 and LPHD each logical device of the plan lacks, their types from the `lnType` rule. */
function planAdditions(params: {
	input: BuildInput
	options: BuildOptions
	lDevices: ReadonlyMap<string, LDeviceDraft>
	logicalNodes: readonly PlannedLogicalNode[]
	/** The LNodes asked for, by logical device and class, built or refused: an LLN0 or LPHD one is never replaced. */
	requested: readonly { inst: string; lnClass: string }[]
}): { added: PlannedAddition[]; refusals: BuildRefusal[]; openValuesUsed: OpenValueUsed[] } {
	const { input, options, lDevices, logicalNodes, requested } = params
	const added: PlannedAddition[] = []
	const refusals: BuildRefusal[] = []
	const openValuesUsed: OpenValueUsed[] = []
	for (const lDevice of lDevices.values()) {
		const planned = logicalNodes.filter((logicalNode) => logicalNode.lDeviceInst === lDevice.inst)
		const held = lDevice.target?.logicalNodes ?? []
		const asked = requested.filter((lnode) => lnode.inst === lDevice.inst)
		const hasLn0 =
			asked.some((lnode) => lnode.lnClass === LN0_IDENTITY.lnClass) ||
			planned.some((logicalNode) => logicalNode.kind === 'LN0') ||
			held.some((logicalNode) => logicalNode.ref.tagName === 'LN0')
		const hasLphd =
			asked.some((lnode) => lnode.lnClass === ADDED_LPHD.lnClass) ||
			planned.some((logicalNode) => logicalNode.identity.lnClass === ADDED_LPHD.lnClass) ||
			held.some((logicalNode) => logicalNode.identity.lnClass === ADDED_LPHD.lnClass)
		const missing = [
			...(hasLn0 ? [] : [{ kind: 'LN0' as const, lnClass: LN0_IDENTITY.lnClass }]),
			...(hasLphd ? [] : [{ kind: 'LPHD' as const, lnClass: ADDED_LPHD.lnClass }]),
		]
		for (const addition of missing) {
			const typed = askLnType({ input, options, context: addition, element: lDevice.element })
			if (typed.refusal) refusals.push(typed.refusal)
			if (typed.used) openValuesUsed.push(typed.used)
			if (typed.lnType)
				added.push({ lDeviceInst: lDevice.inst, kind: addition.kind, lnType: typed.lnType })
		}
	}
	return { added, refusals, openValuesUsed }
}
