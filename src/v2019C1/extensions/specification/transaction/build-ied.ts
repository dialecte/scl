import { planWithServer } from '../query/plan-ied'
import { ADDED_LPHD } from './build-ied.constants'
import { writeValues } from './write-values'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { importTypes } from '@/v2019C1/extensions/data-model/transaction/import-types'
import { readAttributes } from '@/v2019C1/helpers'

import type {
	BuildIedParams,
	IedBuildPlan,
	IedBuildResult,
	PlannedLogicalNode,
} from './build-ied.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Build the data model of a specification IED from logical nodes, and bind each logical node to its own: one logical
 * device per function (or equipment function, or subfunction holding subfunctions; an LNode's own `ldInst` wins), its
 * name normalised from the function's and decided over the whole document; one LN per LNode, its identity and type
 * the LNode's; the LN0 and the LPHD a logical device lacks, added. LNodes another IED implements are left out and
 * listed. Values the standard leaves open (a missing type, the type of an added LN0 or LPHD, a caller's logical device
 * name) come from `openValues` rules, are judged like the engine's own, and are listed; without a rule the build is
 * refused. The values the LNodes specify (a DAS with a `Val`) are written on the DOI, SDI and DAI of their logical
 * nodes (`plan.values`); those the type does not hold, or of an excluded functional constraint, are listed in
 * `plan.valuesLeftOut`. Building again what is built writes nothing.
 *
 * Refuses with `SPECIFICATION_BUILD_REFUSED` before any write, listing every refusal (`meta.refusals`); with
 * `ELEMENT_NOT_FOUND` when the document holds no such IED or LNode.
 *
 * @intent build the data model of a specification IED from logical nodes
 *
 * @example
 * const { plan, created } = await tx.specification.buildIed({
 * 	ied,
 * 	lnodes,
 * 	openValues: { lnType: firstOf(sameClassInTargetIed, firstOfClass) },
 * })
 */
export async function buildIed(
	tx: Core.Transaction<Config>,
	params: BuildIedParams,
): Promise<IedBuildResult> {
	const { plan, server, contextTypeIds } = await planWithServer(tx, params)
	const [first] = plan.refusals
	if (first || !server) {
		throwDialecteError(SCL_ERRORS.SPECIFICATION_BUILD_REFUSED, {
			detail: first?.detail,
			meta: { reason: first?.reason, refusals: plan.refusals },
		})
	}
	const typeIds = await importContextTypes({ tx, params, contextTypeIds })
	return writePlan({ tx, plan: withWrittenTypes({ plan, typeIds }), server, typeIds })
}

/**
 * The plan with each type as it is written: a type imported from the context document under another id (an equal type
 * already there) is named by that id. `openValuesUsed` keeps what the rules answered.
 */
function withWrittenTypes(params: {
	plan: IedBuildPlan
	typeIds: ReadonlyMap<string, string>
}): IedBuildPlan {
	const { plan, typeIds } = params
	if (typeIds.size === 0) return plan
	return {
		...plan,
		logicalNodes: plan.logicalNodes.map((logicalNode) =>
			logicalNode.existing
				? logicalNode
				: { ...logicalNode, lnType: typeIds.get(logicalNode.lnType) ?? logicalNode.lnType },
		),
		added: plan.added.map((addition) => ({
			...addition,
			lnType: typeIds.get(addition.lnType) ?? addition.lnType,
		})),
	}
}

/**
 * The types the plan picked from the context document alone, imported with their closure: each id, as the document
 * built in now names it (an equal type already there is reused under its own id).
 */
async function importContextTypes(params: {
	tx: Core.Transaction<Config>
	params: BuildIedParams
	contextTypeIds: readonly string[]
}): Promise<ReadonlyMap<string, string>> {
	const { tx, contextTypeIds } = params
	const { contextQuery } = params.params
	if (!contextQuery || contextTypeIds.length === 0) return new Map()
	const { idRemap } = await importTypes(tx, {
		sourceQuery: contextQuery,
		records: [],
		lnodeTypeIds: contextTypeIds,
	})
	return idRemap
}

/** Writes the plan: the new logical devices, then in each the LN0, the LNs in LNode order, the LPHD; then the bindings. */
async function writePlan(params: {
	tx: Core.Transaction<Config>
	plan: IedBuildPlan
	server: Scl.Ref<'Server'>
	/** The id each imported type has in the document built in. */
	typeIds: ReadonlyMap<string, string>
}): Promise<IedBuildResult> {
	const { tx, plan, server, typeIds } = params
	const created: IedBuildResult['created'] = { lDevices: [], logicalNodes: [] }
	const bound: Scl.Ref<'LNode'>[] = []
	const logicalNodeOf = new Map(
		plan.logicalNodes.flatMap((logicalNode) =>
			logicalNode.existing ? [[logicalNode.lnode.id ?? '', logicalNode.existing] as const] : [],
		),
	)
	for (const lDevice of plan.lDevices) {
		const lDeviceRef = lDevice.existing ?? (await addLDevice({ tx, server, inst: lDevice.inst }))
		if (!lDevice.existing) created.lDevices.push(lDeviceRef)
		const fresh = plan.logicalNodes.filter(
			(logicalNode) => logicalNode.lDeviceInst === lDevice.inst && !logicalNode.existing,
		)
		const added = plan.added.filter((addition) => addition.lDeviceInst === lDevice.inst)
		const ordered = [
			...added
				.filter((addition) => addition.kind === 'LN0')
				.map((addition) => ({ kind: 'LN0' as const, lnType: addition.lnType })),
			...fresh,
			...added
				.filter((addition) => addition.kind === 'LPHD')
				.map((addition) => ({
					kind: 'LN' as const,
					identity: { ...ADDED_LPHD },
					lnType: addition.lnType,
				})),
		]
		for (const logicalNode of ordered) {
			const lnType = typeIds.get(logicalNode.lnType) ?? logicalNode.lnType
			const written = await addLogicalNode({
				tx,
				lDevice: lDeviceRef,
				logicalNode: { ...logicalNode, lnType },
			})
			created.logicalNodes.push(written.ref)
			if ('lnode' in logicalNode) {
				await tx.update(logicalNode.lnode, { attributes: { lnUuid: written.uuid } })
				bound.push(logicalNode.lnode)
				logicalNodeOf.set(logicalNode.lnode.id ?? '', written.ref)
			}
		}
	}
	await writeValues({ tx, values: plan.values, logicalNodeOf })
	return { plan, created, bound }
}

async function addLDevice(params: {
	tx: Core.Transaction<Config>
	server: Scl.Ref<'Server'>
	inst: string
}): Promise<Scl.Ref<'LDevice'>> {
	const record = await params.tx.addChild(params.server, {
		tagName: 'LDevice',
		attributes: { inst: params.inst },
	})
	return { tagName: 'LDevice', id: record.id }
}

/** Adds one LN0 or LN; its uuid is the one the record was given. */
async function addLogicalNode(params: {
	tx: Core.Transaction<Config>
	lDevice: Scl.Ref<'LDevice'>
	logicalNode:
		| Pick<PlannedLogicalNode, 'lnode' | 'kind' | 'identity' | 'lnType'>
		| { kind: 'LN0'; lnType: string }
		| { kind: 'LN'; identity: PlannedLogicalNode['identity']; lnType: string }
}): Promise<{ ref: Scl.Ref<'LN' | 'LN0'>; uuid: string }> {
	const { tx, lDevice, logicalNode } = params
	const record =
		logicalNode.kind === 'LN0'
			? await tx.addChild(lDevice, {
					tagName: 'LN0',
					attributes: { lnClass: 'LLN0', inst: '', lnType: logicalNode.lnType },
				})
			: await tx.addChild(lDevice, {
					tagName: 'LN',
					attributes: {
						...(logicalNode.identity.prefix && { prefix: logicalNode.identity.prefix }),
						lnClass: logicalNode.identity.lnClass,
						inst: logicalNode.identity.inst,
						lnType: logicalNode.lnType,
					},
				})
	const { uuid } = readAttributes({ record, defaults: 'none' })
	return { ref: { tagName: record.tagName, id: record.id }, uuid: uuid ?? '' }
}
