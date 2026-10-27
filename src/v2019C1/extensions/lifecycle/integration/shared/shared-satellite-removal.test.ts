import { findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleTarget, LifecycleVerb } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// An element several instances share — a category, a role, a variable an earlier version made once for two
// instances — that the template retires leaves the project only when nothing outside the instance updated names it;
// else only what that instance gave it goes. The report lists what the apply writes.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'function-s' } as Scl.Ref<'Function'>
const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>

/** The shared elements a case reads, and the references a report may list of them. */
const SHARED_TAGS = ['AllocationRole', 'FunctionCategory', 'Variable'] as const
const LISTED_TAGS = new Set<string>([
	...SHARED_TAGS,
	'FunctionCatRef',
	'FunctionRef',
	'VariableApplyTo',
	'AllocationRoleRef',
])

// A function library file classifying its function in a category.
const categoryXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s">
					<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="category-ref-s"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" desc="revision 1" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// An application file allocating its function to a role.
const roleXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-source-uuid" ${id}="role-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="role-function-ref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="role-source-uuid" ${id}="role-ref-s"/>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A function library file whose variable applies to its function.
const variableXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-source-uuid" ${id}="variable-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source-uuid" ${id}="variable-apply-to-s"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project of two bays, the first holding a function of its own.
const twoBaysXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1">
					<Function name="Local" uuid="local-uuid" ${id}="local"/>
				</Bay>
				<Bay name="B2" ${id}="bay-b2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project of two bays holding a role of the template role's name, none allocated to it.
const projectRoleXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-project-uuid" ${id}="role-project"/>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1"/>
				<Bay name="B2" ${id}="bay-b2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project of two bays whose own application, in the first bay, composes a function of its own.
const projectApplicationXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Application name="Local_App" type="DCS" uuid="local-application-uuid" ${id}="local-application">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="local-function-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="local-function-role-content">
							<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Local" functionUuid="local-uuid" ${id}="local-function-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1">
					<Function name="Local" uuid="local-uuid" ${id}="local"/>
				</Bay>
				<Bay name="B2" ${id}="bay-b2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project an earlier version wrote: one variable made from the template's, applying to both instances.
const mergedVariableXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="substation-private-t">
				<eIEC61850-6-100:Variable name="VXCBR" uuid="variable-merged-uuid" templateUuid="variable-source-uuid" ${id}="variable-merged">
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="prot-1-uuid" ${id}="apply-to-1"/>
					<eIEC61850-6-100:VariableApplyTo element="S1/V1/B2/Prot" elementUuid="prot-2-uuid" ${id}="apply-to-2"/>
				</eIEC61850-6-100:Variable>
			</Private>
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-b1">
					<Function name="Prot" uuid="prot-1-uuid" templateUuid="function-source-uuid" ${id}="prot-1"/>
				</Bay>
				<Bay name="B2" ${id}="bay-b2">
					<Function name="Prot" uuid="prot-2-uuid" templateUuid="function-source-uuid" ${id}="prot-2"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/**
 * What a case does, in order: place the template under a bay, change the template, change the project, update the
 * instance placed in a bay (or every instance, started from the voltage level), update through the verb alone.
 */
type Operation =
	| { place: string }
	| { drop: Scl.Ref<Scl.ElementsOf> | { uuid: string; tagName: Scl.ElementsOf } }
	| { revise: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }
	| { project: (tx: Core.Transaction<Config>) => Promise<void> }
	| { update: string }
	| { updateEvery: true }
	| { updateWithoutReport: string }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	verb?: Extract<LifecycleVerb, 'fsd' | 'asd'>
	operations: Operation[]
	expected: {
		/** Every shared element in the end: `<tag> <name>: <what its references name>`. */
		held: string[]
		/** What the last report lists of the shared elements and their references, as `<change> <tag>`. */
		listed?: string[]
	}
}

describe('lifecycle — a shared element the template retires', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two instances classified by a category the template retires, the first updated → the category stays for the second, without the first reference':
			{
				sourceXml: categoryXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ drop: { tagName: 'FunctionCategory', id: 'category-s' } },
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['FunctionCategory MEASUREMENT: B2/Prot'],
					listed: ['removed FunctionCatRef'],
				},
			},
		'two applications allocated to a role the template retires, the first updated → the role stays for the second, without the first function':
			{
				sourceXml: roleXml,
				targetXml: twoBaysXml,
				verb: 'asd',
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ drop: { tagName: 'AllocationRoleRef', id: 'role-ref-s' } },
					{ drop: { tagName: 'AllocationRole', id: 'role-s' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['AllocationRole HMI_PC: B2/Prot'],
					listed: ['removed AllocationRoleRef', 'removed FunctionRef'],
				},
			},
		"a project role an earlier placement mapped the template role onto, only this application allocated to it, the template retires it → the role is the project's own: it keeps the application function, listed as such":
			{
				sourceXml: roleXml,
				targetXml: projectRoleXml,
				verb: 'asd',
				operations: [
					{ place: 'bay-b1' },
					{ drop: { tagName: 'AllocationRoleRef', id: 'role-ref-s' } },
					{ drop: { tagName: 'AllocationRole', id: 'role-s' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['AllocationRole HMI_PC: B1/Prot'],
					listed: ['removed AllocationRoleRef', 'target-only FunctionRef'],
				},
			},
		'a role the template retires that an application of the project refers to, though it allocates none of its functions → the role stays, without the instance function':
			{
				sourceXml: roleXml,
				targetXml: projectApplicationXml,
				verb: 'asd',
				operations: [
					{ place: 'bay-b1' },
					{ project: referToPlacedRole },
					{ drop: { tagName: 'AllocationRoleRef', id: 'role-ref-s' } },
					{ drop: { tagName: 'AllocationRole', id: 'role-s' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['AllocationRole HMI_PC: '],
					listed: ['removed AllocationRoleRef', 'removed FunctionRef'],
				},
			},
		'two instances classified by a category the template retires, both updated in one apply → the category and both references gone':
			{
				sourceXml: categoryXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ drop: { tagName: 'FunctionCategory', id: 'category-s' } },
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ updateEvery: true },
				],
				expected: { held: [], listed: ['removed FunctionCatRef'] },
			},
		'a category the template retires that also classifies a function of the project → it stays for that function, without the instance reference':
			{
				sourceXml: categoryXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ project: classifyLocalFunction },
					{ drop: { tagName: 'FunctionCategory', id: 'category-s' } },
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ update: 'bay-b1' },
				],
				expected: {
					held: ['FunctionCategory MEASUREMENT: B1/Local'],
					listed: ['removed FunctionCatRef'],
				},
			},
		'an earlier version made one variable for two instances, the template drops it, the first updated → the variable stays for the second':
			{
				sourceXml: variableXml,
				targetXml: mergedVariableXml,
				operations: [{ drop: { tagName: 'Variable', id: 'variable-s' } }, { update: 'bay-b1' }],
				expected: {
					held: ['Variable VXCBR: B2/Prot'],
					listed: ['removed VariableApplyTo'],
				},
			},
		'two instances classified by a category the template retires, the first updated by the verb alone → the category stays for the second':
			{
				sourceXml: categoryXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ place: 'bay-b2' },
					{ drop: { tagName: 'FunctionCategory', id: 'category-s' } },
					{ updateWithoutReport: 'bay-b1' },
				],
				expected: { held: ['FunctionCategory MEASUREMENT: B2/Prot'] },
			},
		'a category the placement made that also classifies a function of the project, the instance updated by the verb alone → that classification stays':
			{
				sourceXml: categoryXml,
				targetXml: twoBaysXml,
				operations: [
					{ place: 'bay-b1' },
					{ project: classifyLocalFunction },
					{ revise: functionRef, attributes: { desc: 'revision 2' } },
					{ updateWithoutReport: 'bay-b1' },
				],
				expected: { held: ['FunctionCategory MEASUREMENT: B1/Local, B1/Prot'] },
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const verb = testCase.verb ?? 'fsd'
		const ref = verb === 'fsd' ? functionRef : applicationRef

		function targetFor(params: {
			anchor: Scl.Ref<Scl.ElementsOf>
			scenario: 'instantiate' | 'template'
		}): LifecycleTarget {
			return {
				verb,
				scenario: params.scenario,
				sourceQuery: source.query,
				ref,
				anchor: params.anchor,
			} as LifecycleTarget
		}

		let lastReport: DiffReport | undefined
		for (const operation of testCase.operations) {
			if ('place' in operation) {
				await reportAndApply({
					document: target,
					lifecycle: targetFor({ anchor: bayRef(operation.place), scenario: 'instantiate' }),
				})
			} else if ('drop' in operation) {
				const dropped =
					'uuid' in operation.drop ? await findByUuid(source.query, operation.drop) : operation.drop
				await source.transaction(async function drop(tx) {
					await tx.delete(dropped)
				})
			} else if ('revise' in operation) {
				await source.transaction(async function revise(tx) {
					await tx.update(operation.revise, { attributes: operation.attributes })
				})
			} else if ('project' in operation) {
				await target.transaction(operation.project)
			} else if ('update' in operation) {
				const instance = await findInstanceIn(target.query, { verb, bay: operation.update })
				const updated = await reportAndApply({
					document: target,
					lifecycle: {
						...targetFor({ anchor: bayRef(operation.update), scenario: 'template' }),
						targetInstance: instance,
					} as LifecycleTarget,
				})
				lastReport = updated.report
			} else if ('updateEvery' in operation) {
				const anchor = { tagName: 'VoltageLevel', id: 'voltage-level-t' } as Scl.Ref<'VoltageLevel'>
				const updated = await reportAndApply({
					document: target,
					lifecycle: targetFor({ anchor, scenario: 'template' }),
				})
				lastReport = updated.report
			} else {
				await target.transaction(async function updateAlone(tx) {
					await updateFsd(tx, {
						sourceQuery: source.query,
						functionRef,
						targetParent: bayRef(operation.updateWithoutReport),
					})
				})
			}
		}

		if (testCase.expected.listed) {
			if (!lastReport) throw new Error('the case lists what a report says: it reports')
			expect(listSharedNodes(lastReport), 'report').toEqual(testCase.expected.listed)
		}
		const held = await describeShared(target.query)
		expect(held, 'apply').toEqual(testCase.expected.held)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

function bayRef(bay: string): Scl.Ref<'Bay'> {
	return { tagName: 'Bay', id: bay } as Scl.Ref<'Bay'>
}

/** The project's own application refers to the role the placement made. */
async function referToPlacedRole(tx: Core.Transaction<Config>): Promise<void> {
	const [role] = await tx.getRecordsByTagName('AllocationRole')
	if (!role) throw new Error('the placement made the role')
	const roleUuid = await tx.getAttribute(role, { name: 'uuid' })
	await tx.addChild(
		{ tagName: 'Application', id: 'local-application' },
		{
			tagName: 'AllocationRoleRef',
			attributes: { allocationRole: 'S1/HMI_PC', allocationRoleUuid: roleUuid ?? '' },
		},
	)
}

/** The project classifies its own function by the category the template placed. */
async function classifyLocalFunction(tx: Core.Transaction<Config>): Promise<void> {
	const [category] = await tx.getRecordsByTagName('FunctionCategory')
	if (!category) throw new Error('the placement made the category')
	await tx.addChild(
		{ tagName: 'FunctionCategory', id: category.id },
		{
			tagName: 'FunctionCatRef',
			attributes: { function: 'S1/V1/B1/Local', functionUuid: 'local-uuid' },
		},
	)
}

/** The instance the template was placed as for a bay: its function there, or the application composing it. */
async function findInstanceIn(
	query: Core.Query<Config>,
	params: { verb: Extract<LifecycleVerb, 'fsd' | 'asd'>; bay: string },
): Promise<Scl.Ref<Scl.ElementsOf>> {
	const { Function: functions = [] } = await query.findDescendants(bayRef(params.bay), {
		collect: 'Function',
	})
	for (const candidate of functions) {
		const { uuid, templateUuid } = await query.getAttributes(candidate)
		if (templateUuid !== 'function-source-uuid') continue
		if (params.verb === 'fsd') return { tagName: 'Function', id: candidate.id }
		// the application composing it: a role refers to it too
		const references = await query.findByAttributes({
			tagName: 'FunctionRef',
			attributes: { functionUuid: uuid ?? '' },
		})
		for (const reference of references) {
			const ancestors = await query.any.findAncestors(reference)
			const application = ancestors.find((ancestor) => ancestor.tagName === 'Application')
			if (application) return { tagName: 'Application', id: application.id }
		}
	}
	throw new Error(`no instance of the template in ${params.bay}`)
}

/** The shared nodes of a report's groups and their references, as `<change> <tag>`, each node once. */
function listSharedNodes(lifecycleReport: DiffReport): string[] {
	const nodes = new Set<DiffNode>()
	function visit(node: DiffNode): void {
		nodes.add(node)
		for (const child of node.children) visit(child)
	}
	for (const group of allGroups(lifecycleReport)) {
		for (const node of [group.primary, ...group.companions]) visit(node)
	}
	const listed = new Set<string>()
	for (const node of nodes) {
		if (node.change === 'unchanged' || !LISTED_TAGS.has(node.tagName)) continue
		listed.add(`${node.change} ${node.tagName}`)
	}
	return [...listed].sort()
}

/** Every shared element, with what its references name. */
async function describeShared(query: Core.Query<Config>): Promise<string[]> {
	const described: string[] = []
	for (const tagName of SHARED_TAGS) {
		for (const shared of await query.getRecordsByTagName(tagName)) {
			const name = await query.any.getAttribute(shared, { name: 'name' })
			const targets: string[] = []
			const tree = await query.any.getTree(shared)
			for (const reference of tree?.tree ?? []) {
				const { functionUuid, elementUuid } = await query.any.getAttributes(reference)
				const described = await describeFunction(query, functionUuid ?? elementUuid)
				targets.push(described)
			}
			described.push(`${tagName} ${name}: ${targets.sort().join(', ')}`)
		}
	}
	return described.sort()
}

/** A function named by its uuid, as `<bay>/<function>`. */
async function describeFunction(
	query: Core.Query<Config>,
	uuid: string | undefined,
): Promise<string> {
	const [element] = await query.findByAttributes({
		tagName: 'Function',
		attributes: { uuid: uuid ?? '' },
	})
	if (!element?.parent) return `nothing (${uuid})`
	const bay = await query.any.getAttribute(element.parent, { name: 'name' })
	const name = await query.any.getAttribute(element, { name: 'name' })
	return `${bay}/${name}`
}
