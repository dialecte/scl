import {
	findByName,
	listAttributeChanges,
	listGroups,
	reportAndApply,
} from '../integration-helpers'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { CROSS_CUTTING_SATELLITE_CONTAINERS } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.constants'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as extractAsd } from '@/v2019C1/extensions/lifecycle/extract/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { TemplateLink } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { SclTest } from '@/v2019C1/test'

// An application's roles refer to the behaviour descriptions that take part in it: the application brings them where it
// goes, placed in a project or extracted to a file of its own, and its role's reference names the one brought.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the file extracted from the placed application holds. */
	extractedQueries: string[]
	/** The template link of the extract; kept by default. */
	templateLink?: TemplateLink
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

/**
 * A variable and a behaviour description of the bay apply to the function the application composes, outside both: they
 * come with the application wherever it goes.
 */
const applyingToFunctionXml = /* xml */ `
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
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="PICKUP" value="1.2" uuid="pickup-source" ${id}="pickup">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/P51_Fn" elementUuid="function-source" ${id}="pickup-apply"/>
						</eIEC61850-6-100:Variable>
						<eIEC61850-6-100:BehaviorDescription name="TRIP_LOGIC" uuid="logic-source" ${id}="logic">
							<eIEC61850-6-100:InputVar varName="Op_general" dataName="PTOC1" doName="Op" daName="general" lnodeUuid="ptoc-source" ${id}="logic-input"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<Function name="P51_Fn" uuid="function-source" ${id}="function">
						<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="ptoc-source" ${id}="ptoc"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The variable and the logic, in the bay, applying to the function placed there. */
const applyingToThePlacedFunction = [
	'//default:Bay/default:Private/v2019C1:Variable[@name="PICKUP"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="P51_Fn"]/@uuid]',
	'//default:Bay/default:Private/v2019C1:BehaviorDescription[@name="TRIP_LOGIC"]/v2019C1:InputVar[@lnodeUuid=//default:Function[@name="P51_Fn"]/default:LNode/@uuid]',
]

describe('asd: what applies to a function the application composes travels with it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a variable and a behaviour description of the bay → placed with the application, listed; extracted again, the same':
			{
				sourceXml: applyingToFunctionXml,
				targetXml: projectXml,
				expectedQueries: applyingToThePlacedFunction,
				extractedQueries: [
					...applyingToThePlacedFunction,
					'//v2019C1:Variable[@name="PICKUP"][@templateUuid="pickup-source"]',
				],
			},
		'the function placed from its own file, extracted with the link broken → what applies to it only keeps its link':
			{
				sourceXml: applyingToFunctionXml.replace(
					`<Function name="P51_Fn" uuid="function-source" ${id}="function">`,
					[
						`<Function name="P51_Fn" uuid="function-source" templateUuid="library-function" ${id}="function">`,
						`<Private type="eIEC61850-6-100" ${id}="function-private">`,
						`<eIEC61850-6-100:FunctionSclRef ${id}="function-file">`,
						`<eIEC61850-6-100:SclFileReference fileName="P51_Fn" fileType="FSD" ${id}="function-file-ref"/>`,
						`</eIEC61850-6-100:FunctionSclRef>`,
						`</Private>`,
					].join(''),
				),
				targetXml: projectXml,
				templateLink: 'break',
				expectedQueries: applyingToThePlacedFunction,
				extractedQueries: [
					...applyingToThePlacedFunction,
					'//v2019C1:Variable[@name="PICKUP"][@templateUuid="pickup-source"]',
					'//v2019C1:BehaviorDescription[@name="TRIP_LOGIC"][@templateUuid="logic-source"]',
				],
			},
		'the same extracted with the template link broken → the variable came with the instance: it loses its link':
			{
				sourceXml: applyingToFunctionXml,
				targetXml: projectXml,
				templateLink: 'break',
				expectedQueries: applyingToThePlacedFunction,
				extractedQueries: [
					...applyingToThePlacedFunction,
					'//v2019C1:Variable[@name="PICKUP"][not(@templateUuid)]',
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
		const { report } = await reportAndApply({
			document: target,
			lifecycle: { verb: 'asd', sourceQuery: source.query, ref, anchor, scenario: 'instantiate' },
		})
		expect(
			listedSatellites({
				nodes: allGroups(report).flatMap((group) => [group.primary, ...group.companions]),
			}),
			'report',
		).toEqual(['BehaviorDescription', 'Variable'])
		const placedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		assertExpectedElementQueries({
			xmlDocument: new DOMParser().parseFromString(placedXml, 'application/xml'),
			queries: applyingToThePlacedFunction,
		})

		const placed = await findByName(target.query, { tagName: 'Application', name: 'P51_App' })
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted asd' })
		await extracted.transaction(async function extractPlacedApplication(tx) {
			await extractAsd(tx, {
				sourceQuery: target.query,
				applicationRef: placed,
				tool: 'TEST',
				who: 'test',
				...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
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

describe('asd: what applies to a composed function, updated after its first placement', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the instance configures the variable, the newer revision changes its value and its description → one variable still, none placed again; the value kept as the instance configured it, listed so, the description written':
			{
				sourceXml: applyingToFunctionXml,
				targetXml: projectXml,
				expectedQueries: [
					'//default:Bay[@name="B1"][count(default:Private/v2019C1:Variable)=1]',
					'//default:Bay[@name="B1"][count(default:Private/v2019C1:BehaviorDescription)=1]',
					'//v2019C1:Variable[@name="PICKUP"][@value="1.3"][@desc="revision 2"]',
				],
				extractedQueries: [],
			},
	}

	async function act({
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B1' })
		const ref = await findByName(source.query, { tagName: 'Application', name: 'P51_App' })
		await reportAndApply({
			document: target,
			lifecycle: { verb: 'asd', sourceQuery: source.query, ref, anchor, scenario: 'instantiate' },
		})
		// the instance configures its variable
		const [placedVariable] = await target.query.getRecordsByTagName('Variable')
		if (!placedVariable) throw new Error('the placement wrote the variable')
		await target.transaction(async function configure(tx) {
			await tx.update(placedVariable, { attributes: { value: '1.3' } })
		})
		const newer = await openSclDocument({
			project,
			xml: applyingToFunctionXml.replace('value="1.2"', 'value="1.5" desc="revision 2"'),
			label: 'next revision',
		})
		const newerRef = await findByName(newer.query, { tagName: 'Application', name: 'P51_App' })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: {
				verb: 'asd',
				sourceQuery: newer.query,
				ref: newerRef,
				anchor,
				scenario: 'template',
			},
		})
		// the change it keeps is listed with the change it brings, in the group writing it
		expect(
			listKept({
				nodes: allGroups(report).flatMap((group) => [group.primary, ...group.companions]),
			}),
			'report',
		).toEqual(['Variable.value: 1.3 -> 1.5 (instance-configuration)'])
		expect(listGroups(report), 'report').toEqual(['modified Variable'])
		expect(listAttributeChanges(report), 'report').toEqual(['desc: - -> revision 2'])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Two applications of one file compose one function, a variable of the bay applying to it. */
const twoApplicationsOneFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="protection" uuid="asd-file" version="0" revision="1" ${id}="asd-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="APP_A" uuid="application-a-source" ${id}="application-a">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="a-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="a-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="a-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Application name="APP_B" uuid="application-b-source" ${id}="application-b">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="b-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="b-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source" ${id}="b-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="PICKUP" value="1.2" uuid="pickup-source" ${id}="pickup">
							<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Prot" elementUuid="function-source" ${id}="pickup-apply"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<Function name="Prot" uuid="function-source" ${id}="function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('asd: a function stood on keeps the satellites it has', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the second application merged onto the function the first placed → one variable, applying to it':
			{
				sourceXml: twoApplicationsOneFunctionXml,
				targetXml: projectXml,
				expectedQueries: [
					'//default:Bay[@name="B1"][count(default:Function)=1]',
					'//default:Bay[@name="B1"][count(default:Private/v2019C1:Variable)=1]',
					'//v2019C1:Variable[@name="PICKUP"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="Prot"]/@uuid]',
				],
				extractedQueries: [],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B1' })
		for (const name of ['APP_A', 'APP_B']) {
			const ref = await findByName(source.query, { tagName: 'Application', name })
			const placement = {
				verb: 'asd' as const,
				sourceQuery: source.query,
				ref,
				anchor,
				scenario: 'instantiate' as const,
			}
			const resolution = { sharedFunctions: 'merge' as const }
			const listed = await report(target.query, { ...placement, resolution })
			await target.transaction(async function placeApplication(tx) {
				await apply(tx, {
					...placement,
					report: listed,
					resolution: { ...resolution, decisions: new Map() },
				})
			})
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * An application composing two functions: the second placed from its own file, holding a variable that applies to the
 * first.
 */
const nestedFileXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="protection" uuid="asd-file" version="0" revision="1" ${id}="asd-header"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="P51_App" uuid="application-source" ${id}="application">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="root-role-source" ${id}="root-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="root-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Own" functionUuid="own-source" ${id}="own-ref"/>
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Library" functionUuid="library-source" ${id}="library-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Own" uuid="own-source" ${id}="own"/>
					<Function name="Library" uuid="library-source" templateUuid="library-template" ${id}="library">
						<Private type="eIEC61850-6-100" ${id}="library-private">
							<eIEC61850-6-100:FunctionSclRef ${id}="library-file">
								<eIEC61850-6-100:SclFileReference fileName="Library" fileType="FSD" ${id}="library-file-ref"/>
							</eIEC61850-6-100:FunctionSclRef>
							<eIEC61850-6-100:Variable name="HELD" value="1" uuid="held-source" ${id}="held">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/TEMPLATE/Own" elementUuid="own-source" ${id}="held-apply"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('asd: what a function placed from its own file holds keeps its link when the extract breaks it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'its variable applying to a function of the instance → in it, still linked': {
			sourceXml: nestedFileXml,
			targetXml: projectXml,
			templateLink: 'break',
			expectedQueries: [
				'//default:Function[@name="Library"]/default:Private/v2019C1:Variable[@name="HELD"]',
			],
			extractedQueries: [
				'//default:Function[@name="Library"]/default:Private/v2019C1:Variable[@name="HELD"][@templateUuid="held-source"]',
				'//default:Function[@name="Own"][not(@templateUuid)]',
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
				...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
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

/** The differences a report lists as kept: `<tag>.<name>: <before> -> <after> (<reason>)`, sorted. */
function listKept(params: { nodes: readonly DiffNode[] }): string[] {
	const kept: string[] = []
	for (const node of params.nodes) {
		for (const change of node.keptAttributeChanges ?? []) {
			kept.push(
				`${node.tagName}.${change.name}: ${change.before} -> ${change.after} (${change.reason})`,
			)
		}
		kept.push(...listKept({ nodes: node.children }))
	}
	return kept.sort()
}

/** The variables and behaviour descriptions a report lists added, by tag, sorted. */
function listedSatellites(params: { nodes: readonly DiffNode[] }): string[] {
	const tags = new Set<string>(CROSS_CUTTING_SATELLITE_CONTAINERS)
	const listed: string[] = []
	for (const node of params.nodes) {
		if (node.change === 'added' && tags.has(node.tagName)) listed.push(node.tagName)
		listed.push(...listedSatellites({ nodes: node.children }))
	}
	return listed.sort()
}
