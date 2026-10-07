import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const sourceBayRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const functionRoleContentRef = {
	tagName: 'FunctionRoleContent',
	id: 'function-role-content-s',
} as Scl.Ref<'FunctionRoleContent'>
const firstBayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'bay-2-t' } as Scl.Ref<'Bay'>

// An Application composing the function "Prot".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="application-function-ref-s"/>
							<!-- gained by the update: <FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Ctrl"/> -->
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
					<!-- gained by the update: <Function name="Ctrl"/> -->
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const twoBaysProjectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="bay-2-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The bay whose instance the user leaves the gained function out of — with the reference to it. */
	leftOutIn?: Scl.Ref<'Bay'>
	/** Leave out only the placement, keeping the reference to it: the apply refuses with this fragment. */
	placementOnly?: string
}

describe('update of an application placed in two bays — a function its template gains is decided per instance', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing left out → the report lists the gained function once per instance, and each bay gets its own':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="Ctrl"]',
					'//default:Bay[@name="B2"]/default:Function[@name="Ctrl"]',
				],
			},
		'left out in the second bay, with the reference to it → the first bay gets it, the second is left as it was':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				leftOutIn: secondBayRef,
				expectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="Ctrl"]'],
				unexpectedQueries: [
					'//default:Bay[@name="B2"]/default:Function[@name="Ctrl"]',
					'//v2019C1:Application[count(.//v2019C1:FunctionRef) = 2][.//v2019C1:FunctionRef/@function = "S1/V1/B2/Prot"]',
				],
			},
		'the placement left out in the second bay, the reference to it kept → the reference depends on the placement: refused':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				leftOutIn: secondBayRef,
				placementOnly: 'is skipped',
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. the application placed in both bays
		for (const anchor of [firstBayRef, secondBayRef]) {
			await target.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: anchor,
				})
			})
		}

		// 2. the template gains a function its application refers to
		await source.transaction(async (tx) => {
			await tx.addChild(sourceBayRef, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
			})
			await tx.addChild(functionRoleContentRef, {
				tagName: 'FunctionRef',
				attributes: {
					function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					functionUuid: 'control-source-uuid',
				},
			})
		})

		// 3. the update: the gained function listed once per bay
		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: firstBayRef,
		}
		const updateReport = await report(target.query, lifecycleTarget)
		const controlPlacements = updateReport.instances.filter(
			(instance) => !instance.rootRef && instance.tree.tagName === 'Function',
		)
		const applications = await target.query.getRecordsByTagName('Application')
		// one placement of "Ctrl" for each instance of the application
		expect(controlPlacements.map((instance) => instance.placedFor?.id).sort()).toEqual(
			applications.map((application) => application.id).sort(),
		)

		// what is left out for the instance of a bay: its "Ctrl", and the change of that application
		const decisions: DecisionMap = new Map()
		if (testCase.leftOutIn) {
			const leftOutBayId = testCase.leftOutIn.id ?? ''
			for (const application of applications) {
				if (!(await applicationLivesIn(target.query, application.id, leftOutBayId))) continue
				for (const instance of updateReport.instances) {
					const forThatInstance =
						instance.placedFor?.id === application.id ||
						(!testCase.placementOnly && instance.rootRef?.id === application.id)
					if (!forThatInstance) continue
					for (const group of instance.groups) decisions.set(group.id, 'skip')
				}
			}
		}
		if (testCase.placementOnly) {
			// the application's reference to the gained function depends on its placement
			const placements = updateReport.instances.filter((instance) => instance.placedFor)
			const placementGroupIds = new Set(
				placements.flatMap((instance) => instance.groups.map((group) => group.id)),
			)
			const referenceGroups = updateReport.instances
				.filter((instance) => instance.rootRef?.tagName === 'Application')
				.flatMap((instance) => instance.groups)
			for (const group of referenceGroups) {
				expect(
					group.dependsOn.some((id) => placementGroupIds.has(id)),
					'report',
				).toBe(true)
			}
			const refused = target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: updateReport, resolution: { decisions } })
			})
			await expect(refused, 'apply').rejects.toThrow(testCase.placementOnly)
			return { assertOn: 'target' }
		}
		await target.transaction(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: updateReport, resolution: { decisions } })
		})

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml })).toEqual([])

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type FreeFunctionTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** Functions of the gained lineage that no instance of the application refers to, by bay. */
	free: { bay: Scl.Ref<'Bay'>; name: string }[]
	/** The bay whose instance the user leaves the gained function out of — with the reference to it. */
	leftOutIn?: Scl.Ref<'Bay'>
	/** Where several qualify for an instance: the one the user picks, by name, or a new one. */
	choose?: string | 'new'
	expected: {
		/** The choice the report lists, by bay: its candidates, and what is chosen — none when left out. */
		choice?: string
		/** A fragment of the refusal of an apply made before the choice; nothing else is then checked. */
		refusal?: string
		/** What the report lists for the gained function, by bay: updated where it sits, or placed for an instance. */
		reported: string[]
		/** The functions of the gained lineage in the end, by bay and name. */
		functions: string[]
	}
}

describe('update of an application placed in two bays — a function of the gained lineage no instance owns', () => {
	const testCases: SclTest.TestCases<FreeFunctionTestCase> = {
		'one in the first bay → taken by the instance of that bay, a new one placed for the other; the report says so':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				free: [{ bay: firstBayRef, name: 'Ctrl' }],
				expected: {
					reported: ['B1: updated', 'B2: placed'],
					functions: ['B1/Ctrl', 'B2/Ctrl'],
				},
			},
		'… and the placement is left out in the second bay → the first bay keeps the taken one, nothing is added':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				free: [{ bay: firstBayRef, name: 'Ctrl' }],
				leftOutIn: secondBayRef,
				expected: {
					reported: ['B1: updated', 'B2: placed'],
					functions: ['B1/Ctrl'],
				},
			},
		"two in the first bay → which one its instance stands on is the user's to choose: listed for that instance, and nothing is written before":
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				free: [
					{ bay: firstBayRef, name: 'Ctrl' },
					{ bay: firstBayRef, name: 'Ctrl_1' },
				],
				expected: {
					choice: 'B1: Ctrl | Ctrl_1 → to choose',
					refusal: 'is not decided',
					reported: ['B1: updated', 'B1: updated', 'B2: placed'],
					functions: [],
				},
			},
		'… the user picks the second one → that instance stands on it, the other stays as it is; the other bay gets its own':
			{
				sourceXml,
				targetXml: twoBaysProjectXml,
				free: [
					{ bay: firstBayRef, name: 'Ctrl' },
					{ bay: firstBayRef, name: 'Ctrl_1' },
				],
				choose: 'Ctrl_1',
				expected: {
					choice: 'B1: Ctrl | Ctrl_1 → Ctrl_1',
					reported: ['B1: updated', 'B1: updated', 'B2: placed'],
					functions: ['B1/Ctrl', 'B1/Ctrl_1', 'B2/Ctrl'],
				},
			},
		'… the user wants a new one → placed for that instance, beside the two': {
			sourceXml,
			targetXml: twoBaysProjectXml,
			free: [
				{ bay: firstBayRef, name: 'Ctrl' },
				{ bay: firstBayRef, name: 'Ctrl_1' },
			],
			choose: 'new',
			expected: {
				choice: 'B1: Ctrl | Ctrl_1 → new',
				reported: ['B1: placed', 'B1: updated', 'B1: updated', 'B2: placed'],
				functions: ['B1/Ctrl', 'B1/Ctrl_1', 'B1/Ctrl_2', 'B2/Ctrl'],
			},
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<FreeFunctionTestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		// 1. the application placed in both bays
		for (const anchor of [firstBayRef, secondBayRef]) {
			await target.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: anchor,
				})
			})
		}
		// 2. functions of the lineage the template is about to gain, that no instance refers to
		await target.transaction(async (tx) => {
			for (const [index, free] of testCase.free.entries()) {
				await tx.addChild(free.bay, {
					tagName: 'Function',
					attributes: {
						name: free.name,
						uuid: `free-function-uuid-${index}`,
						templateUuid: 'control-source-uuid',
					},
				})
			}
		})
		// 3. the template gains that function, and its application refers to it
		await source.transaction(async (tx) => {
			await tx.addChild(sourceBayRef, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
			})
			await tx.addChild(functionRoleContentRef, {
				tagName: 'FunctionRef',
				attributes: {
					function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl',
					functionUuid: 'control-source-uuid',
				},
			})
		})

		// 4. what the report lists for "Ctrl", per instance of the application
		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: firstBayRef,
		}
		let updateReport = await report(target.query, lifecycleTarget)
		const applications = await target.query.getRecordsByTagName('Application')
		const bayOfApplication = new Map<string, string>()
		for (const application of applications) {
			for (const bay of [firstBayRef, secondBayRef]) {
				if (await applicationLivesIn(target.query, application.id, bay.id ?? '')) {
					bayOfApplication.set(application.id, (await bayName(target.query, bay)) ?? '')
				}
			}
		}
		// where several qualify for an instance: listed for it, chosen by the user
		const choiceRow = updateReport.mappings.find((mapping) => mapping.tagName === 'Function')
		const decisionMappings = new Map<string, DecisionMapping>()
		if (choiceRow && testCase.choose) {
			const picked = choiceRow.candidates.find((candidate) => candidate.title === testCase.choose)
			decisionMappings.set(choiceRow.id, picked ? { existing: picked.ref } : { create: {} })
			updateReport = await report(target.query, {
				...lifecycleTarget,
				resolution: { mappings: decisionMappings },
			})
		}
		const listedChoice = updateReport.mappings.find((mapping) => mapping.tagName === 'Function')
		let choice: string | undefined
		if (listedChoice) {
			const chosen = listedChoice.mapping
			const outcome = !chosen
				? 'to choose'
				: 'create' in chosen
					? 'new'
					: listedChoice.candidates.find((candidate) => candidate.ref.id === chosen.existing.id)
							?.title
			choice = `${bayOfApplication.get(listedChoice.placedFor?.id ?? '')}: ${listedChoice.candidates.map((candidate) => candidate.title).join(' | ')} → ${outcome}`
		}
		expect(choice, 'report').toBe(testCase.expected.choice)
		if (testCase.expected.refusal) {
			expect(updateReport.needsDecisions, 'report').toBe(true)
			const refused = target.transaction(async (tx) => {
				await apply(tx, {
					...lifecycleTarget,
					report: updateReport,
					resolution: { decisions: new Map() },
				})
			})
			await expect(refused, 'apply').rejects.toThrow(testCase.expected.refusal)
			return
		}

		const reported: string[] = []
		for (const instance of updateReport.instances) {
			const sourceRef = instance.tree.sourceRef as Scl.Ref<'Function'> | undefined
			if (instance.tree.tagName !== 'Function' || !sourceRef) continue
			const sourceUuid = await source.query.getAttribute(sourceRef, { name: 'uuid' })
			if (sourceUuid !== 'control-source-uuid') continue
			if (instance.placedFor) {
				reported.push(`${bayOfApplication.get(instance.placedFor.id ?? '')}: placed`)
			} else if (instance.rootRef) {
				const parent = (await target.query.getRecord(instance.rootRef as Scl.Ref<'Function'>))
					?.parent
				reported.push(
					`${parent ? await bayName(target.query, parent as Scl.Ref<'Bay'>) : '?'}: updated`,
				)
			}
		}
		expect(reported.sort(), 'report').toEqual(testCase.expected.reported)

		// what is left out for the instance of a bay: its "Ctrl", and the change of that application
		const decisions: DecisionMap = new Map()
		if (testCase.leftOutIn) {
			const leftOutBayId = testCase.leftOutIn.id ?? ''
			for (const application of applications) {
				if (!(await applicationLivesIn(target.query, application.id, leftOutBayId))) continue
				for (const instance of updateReport.instances) {
					const forThatInstance =
						instance.placedFor?.id === application.id || instance.rootRef?.id === application.id
					if (!forThatInstance) continue
					for (const group of instance.groups) decisions.set(group.id, 'skip')
				}
			}
		}
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: updateReport,
				resolution: { decisions, mappings: decisionMappings },
			})
		})

		const functions: string[] = []
		for (const record of await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'control-source-uuid' },
		})) {
			const name = await target.query.getAttribute(record, { name: 'name' })
			const bay = record.parent ? await bayName(target.query, record.parent as Scl.Ref<'Bay'>) : '?'
			functions.push(`${bay}/${name}`)
		}
		expect(functions.sort(), 'apply').toEqual(testCase.expected.functions)

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

async function bayName(query: Scl.Query, bay: Scl.Ref<'Bay'>): Promise<string | undefined> {
	return query.getAttribute(bay, { name: 'name' })
}

/** An application instance lives in a bay when the functions it composes sit there. */
async function applicationLivesIn(
	query: Scl.Query,
	applicationId: string,
	bayId: string,
): Promise<boolean> {
	const { FunctionRef: references = [] } = await query.findDescendants(
		{ tagName: 'Application', id: applicationId } as Scl.Ref<'Application'>,
		{ collect: 'FunctionRef' },
	)
	for (const reference of references) {
		const { functionUuid } = await query.getAttributes(reference)
		const [composed] = await query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: functionUuid },
		})
		if (composed?.parent?.id === bayId) return true
	}
	return false
}
