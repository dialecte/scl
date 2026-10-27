import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	asd as instantiateAsd,
	fsd as instantiateFsd,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SharedFunctions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

// Two applications of one file placed in one bay compose functions with an identical template reference: by
// default each places a function of its own; merging, the second stands on the one the first placed — one found is
// taken, several are the consumer's to choose, none is placed. The report lists what the apply writes.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const firstBay = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBay = { tagName: 'Bay', id: 'bay-second-t' } as Scl.Ref<'Bay'>
const firstApplication = { tagName: 'Application', id: 'application-a' } as Scl.Ref<'Application'>
const secondApplication = { tagName: 'Application', id: 'application-b' } as Scl.Ref<'Application'>

/** An application of the file composing `function`, on the role PIU when `role`. */
function application(params: {
	name: string
	recordId: string
	functionName: string
	functionUuid: string
}): string {
	const { name, recordId, functionName, functionUuid } = params
	return /* xml */ `
		<eIEC61850-6-100:Application name="${name}" type="PAC" uuid="${recordId}-uuid" ${id}="${recordId}">
			<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="${recordId}-role">
				<eIEC61850-6-100:FunctionRoleContent ${id}="${recordId}-role-content">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/${functionName}" functionUuid="${functionUuid}" ${id}="${recordId}-function-ref"/>
				</eIEC61850-6-100:FunctionRoleContent>
			</eIEC61850-6-100:FunctionRole>
			<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="role-source" ${id}="${recordId}-allocation"/>
		</eIEC61850-6-100:Application>
	`
}

/** The applications compose two functions of the file made from one library function; a third is made from another. */
const twoFunctionsXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				${application({ name: 'APP_A', recordId: 'application-a', functionName: 'Prot', functionUuid: 'protection-a-source' })}
				${application({ name: 'APP_B', recordId: 'application-b', functionName: 'Prot_B', functionUuid: 'protection-b-source' })}
				<eIEC61850-6-100:Application name="APP_C" type="PAC" uuid="application-c-uuid" ${id}="application-c">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="application-c-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="application-c-role-content">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-a-source" ${id}="application-c-protection-a-ref"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot_B" functionUuid="protection-b-source" ${id}="application-c-protection-b-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-a-source" ${id}="role-protection-a-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot_B" functionUuid="protection-b-source" ${id}="role-protection-b-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="protection-a-source" templateUuid="library-protection" ${id}="protection-a-s"/>
					<Function name="Prot_B" uuid="protection-b-source" templateUuid="library-protection" ${id}="protection-b-s"/>
					<Function name="Other" uuid="other-source" templateUuid="library-other" ${id}="other-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The applications compose the same function of the file. */
const oneFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				${application({ name: 'APP_A', recordId: 'application-a', functionName: 'Prot', functionUuid: 'protection-source' })}
				${application({ name: 'APP_B', recordId: 'application-b', functionName: 'Prot', functionUuid: 'protection-source' })}
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-source" ${id}="role-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source" ${id}="role-protection-s"/>
						</eIEC61850-6-100:AllocationRole>
					</Private>
					<Function name="Prot" uuid="protection-source" ${id}="protection-s"/>
					<Function name="Other" uuid="other-source" ${id}="other-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="bay-second-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	sharedFunctions?: SharedFunctions
	/** Where the first application is placed. Default: the bay of the second. */
	firstIn?: Scl.Ref<'Bay'>
	/** The function placed on its own in the bay before, this many times. */
	placedBefore?: number
	/** The function placed on its own before, by name. Default: Prot. */
	placedBeforeName?: string
	/** The choice the consumer makes for the second application's function: one by name, or a new one. */
	choose?: string | 'new'
	/** The application placed second. Default: APP_B. */
	second?: Scl.Ref<'Application'>
	expected: {
		/** The function mapping the second placement's report lists: `<candidates> → <outcome>`; none when absent. */
		listed?: string
		/** A fragment of the refusal of the second apply; nothing else is then checked. */
		refusal?: string
		/** The functions of the second application's bay, by name. */
		functions?: string[]
		/** The function each application refers to, by name. */
		referenced?: string[]
		/** How many functions the role of the bay allocates. */
		allocations?: number
		/** How many allocations of the role the second report lists added. */
		listedAllocations?: number
		/** How a function stood on is listed: `<kind> <reason> <locked or open> <ambiguous or not>`. */
		listedAs?: string
		/** How many functions the second report lists placed. */
		placedFunctions?: number
	}
}

describe('a first placement of an application merging the functions applications share', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two functions of one library function, nothing asked → each application places its own': {
			sourceXml: twoFunctionsXml,
			targetXml: projectXml,
			expected: {
				functions: ['Prot', 'Prot_B'],
				referenced: ['Prot', 'Prot_B'],
				allocations: 2,
				listedAllocations: 1,
				placedFunctions: 1,
			},
		},
		'two functions of one library function, merged → the second application stands on the first one':
			{
				sourceXml: twoFunctionsXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				expected: {
					listed: 'Prot → Prot',
					functions: ['Prot'],
					referenced: ['Prot', 'Prot'],
					allocations: 1,
					listedAllocations: 0,
					listedAs: 'shared only locked unambiguous',
					placedFunctions: 0,
				},
			},
		'the same function, nothing asked → each application places its own': {
			sourceXml: oneFunctionXml,
			targetXml: projectXml,
			expected: {
				functions: ['Prot', 'Prot_1'],
				referenced: ['Prot', 'Prot_1'],
				allocations: 2,
				listedAllocations: 1,
				placedFunctions: 1,
			},
		},
		'the same function, merged → one function, both applications on it, the role allocating it once':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				expected: {
					listed: 'Prot → Prot',
					functions: ['Prot'],
					referenced: ['Prot', 'Prot'],
					allocations: 1,
					listedAllocations: 0,
					listedAs: 'shared only locked unambiguous',
					placedFunctions: 0,
				},
			},
		'merged, an application composing two functions of one library function, one already placed → it stands on that one and places the other':
			{
				sourceXml: twoFunctionsXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				second: { tagName: 'Application', id: 'application-c' } as Scl.Ref<'Application'>,
				expected: {
					listed: 'Prot → Prot',
					functions: ['Prot', 'Prot_B'],
					referenced: ['Prot', 'Prot', 'Prot_B'],
				},
			},
		'merged, the bay holds a function of another template of the file → the application places its own':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				firstIn: secondBay,
				placedBefore: 1,
				placedBeforeName: 'Other',
				expected: {
					functions: ['Other', 'Prot'],
					referenced: ['Prot', 'Prot'],
					placedFunctions: 1,
				},
			},
		'merged, the bay holds a function of the file made from another library function → the application places its own':
			{
				sourceXml: twoFunctionsXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				firstIn: secondBay,
				placedBefore: 1,
				placedBeforeName: 'Other',
				expected: {
					functions: ['Other', 'Prot_B'],
					referenced: ['Prot', 'Prot_B'],
					placedFunctions: 1,
				},
			},
		'merged, the function the first application placed is in another bay → the second places its own':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				firstIn: secondBay,
				expected: { functions: ['Prot'], referenced: ['Prot', 'Prot'] },
			},
		'merged, two functions of the template in the bay, nothing chosen → the report offers both, the apply refuses':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				firstIn: secondBay,
				placedBefore: 2,
				expected: { listed: 'Prot | Prot_1 → to choose', refusal: 'is not decided' },
			},
		'merged, two functions of the template in the bay, the second chosen → the application stands on it':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
				sharedFunctions: 'merge',
				firstIn: secondBay,
				placedBefore: 2,
				choose: 'Prot_1',
				expected: {
					listed: 'Prot | Prot_1 → Prot_1',
					functions: ['Prot', 'Prot_1'],
					referenced: ['Prot', 'Prot_1'],
				},
			},
		'merged, two functions of the template in the bay, a new one chosen → placed beside them': {
			sourceXml: oneFunctionXml,
			targetXml: projectXml,
			sharedFunctions: 'merge',
			firstIn: secondBay,
			placedBefore: 2,
			choose: 'new',
			expected: {
				listed: 'Prot | Prot_1 → new',
				functions: ['Prot', 'Prot_1', 'Prot_2'],
				referenced: ['Prot', 'Prot_2'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sharedFunctions = testCase.sharedFunctions
		const options = sharedFunctions ? { sharedFunctions } : {}

		// the functions placed on their own before
		const [protection] = await source.query.findByAttributes({
			tagName: 'Function',
			attributes: { name: testCase.placedBeforeName ?? 'Prot' },
		})
		for (let placed = 0; placed < (testCase.placedBefore ?? 0); placed++) {
			await target.transaction(async function placeAlone(tx) {
				await instantiateFsd(tx, {
					sourceQuery: source.query,
					functionRef: { tagName: 'Function', id: protection.id } as Scl.Ref<'Function'>,
					targetParent: firstBay,
				})
			})
		}

		// the first application
		const firstTarget = {
			verb: 'asd' as const,
			scenario: 'instantiate' as const,
			sourceQuery: source.query,
			ref: firstApplication,
			anchor: testCase.firstIn ?? firstBay,
		}
		const firstReport = await report(target.query, { ...firstTarget, resolution: options })
		await target.transaction(async function placeFirst(tx) {
			await apply(tx, {
				...firstTarget,
				report: firstReport,
				resolution: { ...options, decisions: new Map() },
			})
		})

		// the second, with the consumer's choice
		const secondTarget = {
			...firstTarget,
			ref: testCase.second ?? secondApplication,
			anchor: firstBay,
		}
		const offered = await report(target.query, { ...secondTarget, resolution: options })
		const offeredFunction = offered.mappings.find((mapping) => mapping.tagName === 'Function')
		const mappings = new Map<string, DecisionMapping>()
		if (offeredFunction && testCase.choose) {
			const picked = offeredFunction.candidates.find(
				(candidate) => candidate.title === testCase.choose,
			)
			mappings.set(offeredFunction.id, picked ? { existing: picked.ref } : { create: {} })
		}
		const listed = await report(target.query, {
			...secondTarget,
			resolution: { ...options, mappings },
		})
		const choice = listed.mappings.find((mapping) => mapping.tagName === 'Function')
		expect(choice && describeChoice(choice), 'report').toBe(testCase.expected.listed)
		const functionMappings = listed.mappings.filter((mapping) => mapping.tagName === 'Function')
		expect(functionMappings.length, 'report: the function mapping, once').toBe(choice ? 1 : 0)
		const unnamed = listed.mappings.filter((mapping) => typeof mapping.id !== 'string')
		expect(unnamed, 'report: every mapping names a source element').toEqual([])
		if (choice && testCase.expected.listedAs) {
			const locked = choice.locked ? 'locked' : 'open'
			const ambiguous = choice.ambiguous ? 'ambiguous' : 'unambiguous'
			expect(`${choice.kind} ${choice.reason} ${locked} ${ambiguous}`, 'report').toBe(
				testCase.expected.listedAs,
			)
		}
		if (testCase.expected.placedFunctions !== undefined) {
			const placed = listed.instances.filter(
				(instance) => !instance.rootRef && instance.tree.tagName === 'Function',
			)
			expect(placed.length, 'report: the functions placed').toBe(testCase.expected.placedFunctions)
		}
		if (testCase.expected.listedAllocations !== undefined) {
			const added = allGroups(listed)
				.flatMap((group) => [group.primary, ...group.companions])
				.flatMap(flattenNodes)
				.filter(
					(node) => node.change === 'added' && node.sourceRef?.id?.startsWith('role-protection'),
				)
			expect(new Set(added.map((node) => node.sourceRef?.id)).size, 'report: the role').toBe(
				testCase.expected.listedAllocations,
			)
		}

		const before = await target.query.getSnapshot({ as: 'xml' })
		const written = target.transaction(async function placeSecond(tx) {
			await apply(tx, {
				...secondTarget,
				report: listed,
				resolution: { ...options, mappings, decisions: new Map() },
			})
		})
		if (testCase.expected.refusal) {
			await expect(written).rejects.toThrow(testCase.expected.refusal)
			const after = await target.query.getSnapshot({ as: 'xml' })
			expect(after, 'nothing written').toBe(before)
			return
		}
		await written

		const functions = await target.query.getChildren(firstBay, 'Function')
		const functionNames = await namesOf(target.query, functions)
		expect(functionNames.sort(), 'apply').toEqual(testCase.expected.functions)
		const referenced: string[] = []
		for (const reference of await target.query.getRecordsByTagName('FunctionRef')) {
			const parent = await target.query.any.findAncestors(reference)
			if (!parent.some((ancestor) => ancestor.tagName === 'Application')) continue
			const path = await target.query.getAttribute(reference, { name: 'function' })
			referenced.push(path?.split('/').at(-1) ?? '')
		}
		expect(referenced.sort(), 'apply').toEqual(testCase.expected.referenced)
		if (testCase.expected.allocations !== undefined) {
			const [role] = await target.query.findByAttributes({
				tagName: 'AllocationRole',
				attributes: { name: 'PIU' },
			})
			const allocations = await target.query.getChildren(role, 'FunctionRef')
			expect(allocations.length, 'apply: the role').toBe(testCase.expected.allocations)
		}
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A function mapping as `<candidates> → <outcome>`. */
function describeChoice(choice: {
	mapping?: DecisionMapping
	candidates: { title: string; ref: { id?: string } }[]
}): string {
	const chosen = choice.mapping
	const outcome = !chosen
		? 'to choose'
		: 'create' in chosen
			? 'new'
			: choice.candidates.find((candidate) => candidate.ref.id === chosen.existing.id)?.title
	return `${choice.candidates.map((candidate) => candidate.title).join(' | ')} → ${outcome}`
}

async function namesOf(
	query: Scl.Query,
	records: readonly { tagName: string; id: string }[],
): Promise<string[]> {
	const names: string[] = []
	for (const record of records) {
		const name = await query.any.getAttribute(record, { name: 'name' })
		names.push(name ?? '')
	}
	return names
}

/** A report node and every node below it. */
function flattenNodes(node: DiffNode): DiffNode[] {
	return [node, ...node.children.flatMap(flattenNodes)]
}

describe('a first placement merging shared functions, made directly', () => {
	type DirectCase = SclTest.BaseXmlTestCase & { targetXml: string }
	const testCases: SclTest.TestCases<DirectCase> = {
		'two functions of the template in the bay, nothing chosen → refused before anything is written':
			{
				sourceXml: oneFunctionXml,
				targetXml: projectXml,
			},
	}

	async function act({ source, target }: SclTest.ActParams<DirectCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const [protection] = await source.query.findByAttributes({
			tagName: 'Function',
			attributes: { name: 'Prot' },
		})
		const functionRef = { tagName: 'Function', id: protection.id } as Scl.Ref<'Function'>
		await target.transaction(async function placeTwice(tx) {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: firstBay })
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: firstBay })
		})
		const before = await target.query.getSnapshot({ as: 'xml' })
		const placed = target.transaction(async function placeMerged(tx) {
			await instantiateAsd(tx, {
				sourceQuery: source.query,
				applicationRef: secondApplication,
				targetParent: firstBay,
				sharedFunctions: 'merge',
			})
		})
		const refusal = await placed.then(
			() => undefined,
			(error: unknown) => {
				const refused = toDialecteError(error)
				return refused && { key: refused.key, meta: refused.meta }
			},
		)
		expect(refusal).toEqual({
			key: 'MAPPING_UNDECIDED',
			meta: { sourceId: 'protection-s', tagName: 'Function', kind: 'shared' },
		})
		const after = await target.query.getSnapshot({ as: 'xml' })
		expect(after, 'nothing written').toBe(before)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
