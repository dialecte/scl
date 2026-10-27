import { findByName, reportAndApply } from '../integration-helpers'

import { describe } from 'vitest'

import { asd as extractAsd } from '@/v2019C1/extensions/lifecycle/extract/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

// An application's roles refer to the behaviour descriptions that take part in it: the application brings them where it
// goes, placed in a project or extracted to a file of its own, and its role's reference names the one brought.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the file extracted from the placed application holds. */
	extractedQueries: string[]
}

/** The role of the application referring to the behaviour description. */
function engineeringRole(params: { path: string }): string {
	return /* xml */ `
		<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" uuid="engineering-role-source" ${id}="engineering-role">
			<eIEC61850-6-100:FunctionRoleContent ${id}="engineering-content">
				<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="${params.path}" behaviorDescriptionUuid="logic-source" ${id}="logic-ref"/>
			</eIEC61850-6-100:FunctionRoleContent>
		</eIEC61850-6-100:FunctionRole>
	`
}

/** A protection application composing one function; its engineering role names the trip logic. */
function applicationXml(params: { logicInFunction: boolean }): string {
	const { logicInFunction } = params
	const logic = /* xml */ `
		<eIEC61850-6-100:BehaviorDescription name="TRIP_LOGIC" uuid="logic-source" ${id}="logic">
			<eIEC61850-6-100:InputVar varName="Op_general" dataName="PTOC1" doName="Op" daName="general" lnodeUuid="ptoc-source" ${id}="logic-input"/>
		</eIEC61850-6-100:BehaviorDescription>
	`
	const logicPath = logicInFunction
		? 'TEMPLATE/TEMPLATE/TEMPLATE/P51_Fn/TRIP_LOGIC'
		: 'TEMPLATE/TEMPLATE/TEMPLATE/TRIP_LOGIC'
	const inBay = logicInFunction ? '' : logic
	const inFunction = logicInFunction
		? `<Private type="eIEC61850-6-100" ${id}="function-private">${logic}</Private>`
		: ''
	const role = engineeringRole({ path: logicPath })
	return /* xml */ `
		<SCL ${ns} ${id}="asd">
			<Header id="protection" uuid="asd-file" version="0" revision="1" ${id}="asd-header"/>
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="TEMPLATE" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="bay-private-s">
							<eIEC61850-6-100:Application name="P51_App" type="Protection" uuid="application-source" ${id}="application">
								<eIEC61850-6-100:FunctionRole name="ROOT" uuid="root-role-source" ${id}="root-role">
									<eIEC61850-6-100:FunctionRoleContent ${id}="root-content">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/P51_Fn" functionUuid="function-source" ${id}="function-ref"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								${role}
							</eIEC61850-6-100:Application>
							${inBay}
						</Private>
						<Function name="P51_Fn" uuid="function-source" ${id}="function">
							${inFunction}
							<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="ptoc-source" ${id}="ptoc"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const emptyXml = /* xml */ `<SCL ${ns} ${id}="extracted-root" version="2007" revision="C" release="5"/>`

/** The role's reference names the behaviour description the document holds, wherever it sits. */
const roleNamesTheLogic =
	'//v2019C1:BehaviorDescriptionRef[@behaviorDescriptionUuid=//v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]/@uuid]'

describe('asd: the behaviour descriptions an application refers to travel with it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'held by the function it composes → placed with it, the role naming it; extracted again, the same':
			{
				sourceXml: applicationXml({ logicInFunction: true }),
				targetXml: projectXml,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="P51_Fn"]/default:Private/v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]',
					'//v2019C1:FunctionRole[@name="ENGINEERING ELEMENTS"]/v2019C1:FunctionRoleContent/v2019C1:BehaviorDescriptionRef',
					roleNamesTheLogic,
				],
				extractedQueries: [
					'//default:Function[@name="P51_Fn"]/default:Private/v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]',
					'//v2019C1:FunctionRole[@name="ENGINEERING ELEMENTS"]/v2019C1:FunctionRoleContent/v2019C1:BehaviorDescriptionRef',
					roleNamesTheLogic,
				],
			},
		'held by the bay beside the application → placed in the bay, the role naming it; extracted again, the same':
			{
				sourceXml: applicationXml({ logicInFunction: false }),
				targetXml: projectXml,
				expectedQueries: [
					'//default:Bay[@name="B1"][count(.//v2019C1:BehaviorDescription)=1]/default:Private/v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]',
					'//v2019C1:FunctionRole[@name="ENGINEERING ELEMENTS"]/v2019C1:FunctionRoleContent/v2019C1:BehaviorDescriptionRef',
					roleNamesTheLogic,
				],
				extractedQueries: [
					'//default:Bay[count(.//v2019C1:BehaviorDescription)=1]/default:Private/v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]',
					'//v2019C1:FunctionRole[@name="ENGINEERING ELEMENTS"]/v2019C1:FunctionRoleContent/v2019C1:BehaviorDescriptionRef',
					roleNamesTheLogic,
				],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const ref = await findByName(source.query, { tagName: 'Application', name: 'P51_App' })
		const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B1' })
		await reportAndApply({
			document: target,
			lifecycle: { verb: 'asd', sourceQuery: source.query, ref, anchor, scenario: 'instantiate' },
		})

		const placed = await findByName(target.query, { tagName: 'Application', name: 'P51_App' })
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted asd' })
		await extracted.transaction(async function extractPlacedApplication(tx) {
			await extractAsd(tx, {
				sourceQuery: target.query,
				applicationRef: placed,
				tool: 'TEST',
				who: 'test',
			})
		})
		const xml = (await extracted.query.getSnapshot({ as: 'xml' })) as string
		assertExpectedElementQueries({
			xmlDocument: new DOMParser().parseFromString(xml, 'application/xml'),
			queries: testCase.extractedQueries,
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
