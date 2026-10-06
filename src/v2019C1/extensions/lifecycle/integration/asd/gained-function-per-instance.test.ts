import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
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
						instance.placedFor?.id === application.id || instance.rootRef?.id === application.id
					if (!forThatInstance) continue
					for (const group of instance.groups) decisions.set(group.id, 'skip')
				}
			}
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
