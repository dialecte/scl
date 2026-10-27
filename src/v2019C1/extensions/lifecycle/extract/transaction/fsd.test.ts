import { fsd } from './fsd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { FunctionSection, FunctionSections } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>`

describe('fsd', () => {
	// ── FunctionCategory uuid remapping across deepClone ──────────────────
	// Source has FunctionCatRef.functionUuid pointing to SubFunction.uuid.
	// After extraction (SubFunction promoted to Function with new uuid),
	// FunctionCatRef must reference the new Function uuid → FunctionCategory preserved.

	describe('FunctionCategory uuid remapping after SubFunction promotion', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			targetXml: string
			act: (source: Scl.Document, target: Scl.Document) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'FunctionCatRef referencing SubFunction uuid → remapped to new Function uuid, FunctionCategory preserved':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
							<Substation ${id}="sub1" name="TEMPLATE">
								<VoltageLevel ${id}="vl1" name="TEMPLATE">
									<Bay ${id}="bay1" name="TEMPLATE"/>
								</VoltageLevel>
								<Private ${id}="cat-priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="MMS CLIENTS">
										<eIEC61850-6-100:SubCategory ${id}="scat1" name="HMI">
											<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" functionUuid="subf1-uuid"/>
										</eIEC61850-6-100:SubCategory>
									</eIEC61850-6-100:FunctionCategory>
								</Private>
								<Function ${id}="func1" name="HMI Function" uuid="func1-uuid">
									<SubFunction ${id}="subf1" name="HMI" uuid="subf1-uuid"/>
								</Function>
							</Substation>
						</SCL>
					`,
					targetXml: emptyTargetXml,
					act: async (source, target) => {
						await target.transaction(async (tx) => {
							await fsd(tx, {
								sourceQuery: source.query,
								functionRef: { tagName: 'SubFunction', id: 'subf1' },
								tool: 'TEST',
								who: 'test',
							})
						})
					},
					expectedQueries: [
						'//default:Substation//v2019C1:FunctionCategory[@name="MMS CLIENTS"]',
						'//v2019C1:SubCategory[@name="HMI"]',
						'//v2019C1:FunctionCatRef[@functionUuid]',
					],
					unexpectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="subf1-uuid"]'],
				},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act: async ({ source, target, testCase }) => {
				if (!target) throw new Error('target required')
				await testCase.act(source, target)
				return { assertOn: 'target' }
			},
		})
	})

	// ── Lineage: the extracted root is the new template; children keep provenance ──
	// A function's subfunctions may themselves be instantiated from other
	// FSDs, identified via SclFileReference + UUID. So the root's own `templateUuid` is
	// stripped (it becomes a fresh template) while child `templateUuid` is PRESERVED.
	describe('lineage: root becomes a fresh template, children keep composition provenance', () => {
		const testCases: SclTest.TestCases<ExtractFunctionCase> = {
			'root Function templateUuid stripped; child SubFunction templateUuid preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE">
							<VoltageLevel ${id}="vl1" name="TEMPLATE">
								<Bay ${id}="bay1" name="TEMPLATE"/>
							</VoltageLevel>
							<Function ${id}="func1" name="Prot" uuid="fn-uuid" templateUuid="fn-tpl">
								<SubFunction ${id}="subf1" name="Sub" uuid="sub-uuid" templateUuid="sub-tpl"/>
							</Function>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionId: 'func1',
				expectedQueries: [
					'//default:Function[@name="Prot"]',
					// a child subfunction may itself be instantiated from another FSD — keep its templateUuid
					'//default:SubFunction[@name="Sub"][@templateUuid="sub-tpl"]',
				],
				unexpectedQueries: [
					// the extracted root is the new template — its own templateUuid is stripped
					'//default:Function[@name="Prot"][@templateUuid]',
				],
			},
		}

		runSclTestCases.withExport<ExtractFunctionCase>({ testCases, act: extractFunction })
	})

	describe('what the function holds', () => {
		const testCases: SclTest.TestCases<ExtractFunctionCase> = {
			'a text-only vendor Private on the function → kept with its text': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="S1">
							<VoltageLevel ${id}="vl1" name="V1">
								<Bay ${id}="bay1" name="B1">
									<Function ${id}="func1" name="Prot" uuid="fn-uuid">
										<Private ${id}="fn-acme" type="ACME-Id">42</Private>
										<Private ${id}="fn-flag" type="ACME-Flag"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionId: 'func1',
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private[@type="ACME-Id"][text()="42"]',
					'//default:Function[@name="Prot"]/default:Private[@type="ACME-Flag"]',
				],
			},
		}

		runSclTestCases.withExport<ExtractFunctionCase>({ testCases, act: extractFunction })
	})
})

/**
 * A bay function holding one element of every optional section of an FSD function: the query that finds each in the
 * extracted file, and the one that finds none of it.
 */
const SECTION_QUERIES: Readonly<Record<FunctionSection, { present: string; absent: string }>> = {
	dataSpecification: {
		present: '//default:LNode/default:Private/v2019C1:DOS[@name="Pos"]',
		absent: '//v2019C1:DOS',
	},
	labels: {
		present: '//default:Function[@name="Prot"]/default:Private/v2019C1:Labels',
		absent: '//v2019C1:Labels',
	},
	inputs: {
		present: '//default:LNode/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef',
		absent: '//v2019C1:LNodeInputs',
	},
	outputs: {
		present: '//default:LNode/default:Private/v2019C1:LNodeOutputs/v2019C1:ControlRef',
		absent: '//v2019C1:LNodeOutputs',
	},
	processResources: {
		present: '//default:Function/default:Private/v2019C1:ProcessResources/v2019C1:ProcessResource',
		absent: '//v2019C1:ProcessResources',
	},
	powerSystemRelations: {
		present:
			'//default:Function/default:Private/v2019C1:PowerSystemRelations/v2019C1:PowerSystemRelation',
		absent: '//v2019C1:PowerSystemRelations',
	},
	behaviorDescriptions: {
		present: '//default:Function/default:Private/v2019C1:BehaviorDescription[@name="Logic"]',
		absent: '//v2019C1:BehaviorDescription',
	},
	variables: {
		present: '//default:Function/default:Private/v2019C1:Variable[@name="Mode"]',
		absent: '//v2019C1:Variable',
	},
	equipment: {
		present:
			'//default:Function[@name="Prot"][default:GeneralEquipment[@name="GE1"]]/default:ConductingEquipment[@name="QA9"]',
		absent:
			'//default:Function[@name="Prot"]/*[local-name()="GeneralEquipment" or local-name()="ConductingEquipment"]',
	},
	categories: {
		present: '//v2019C1:FunctionCategory[@name="PROTECTION"]/v2019C1:FunctionCatRef',
		absent: '//v2019C1:FunctionCategory',
	},
}

/** A section left out takes with it what names only it: the relation to the function's equipment. */
const GOES_WITH: Readonly<Partial<Record<FunctionSection, readonly FunctionSection[]>>> = {
	equipment: ['powerSystemRelations'],
}

const fullFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
		<Substation ${id}="sub1" name="S1">
			<Private type="eIEC61850-6-100" ${id}="sub1-private">
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="cat-uuid" ${id}="cat">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Prot" functionUuid="fn-uuid" ${id}="cat-ref"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel ${id}="vl1" name="V1">
				<Bay ${id}="bay1" name="B1">
					<Function ${id}="func1" name="Prot" uuid="fn-uuid">
						<Private type="eIEC61850-6-100" ${id}="fn-private">
							<eIEC61850-6-100:Labels ${id}="fn-labels">
								<Label lang="en" ${id}="fn-label">Protection</Label>
							</eIEC61850-6-100:Labels>
							<eIEC61850-6-100:BehaviorDescription name="Logic" uuid="bd-uuid" ${id}="bd"/>
							<eIEC61850-6-100:PowerSystemRelations ${id}="relations">
								<eIEC61850-6-100:PowerSystemRelation name="Trips" relation="S1/V1/B1/Prot/GE1" relationUuid="ge-uuid" uuid="relation-uuid" ${id}="relation"/>
							</eIEC61850-6-100:PowerSystemRelations>
							<eIEC61850-6-100:ProcessResources ${id}="resources">
								<eIEC61850-6-100:ProcessResource name="CT" uuid="resource-uuid" ${id}="resource"/>
							</eIEC61850-6-100:ProcessResources>
							<eIEC61850-6-100:Variable name="Mode" value="1" uuid="variable-uuid" ${id}="variable">
								<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="fn-uuid" ${id}="variable-apply"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="lnode-uuid" ${id}="lnode">
							<Private type="eIEC61850-6-100" ${id}="lnode-private">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="PTOC" sLnInst="1" ${id}="spec"/>
								<eIEC61850-6-100:DOS name="Pos" ${id}="dos">
									<eIEC61850-6-100:DAS name="ctlModel" ${id}="das"/>
								</eIEC61850-6-100:DOS>
								<eIEC61850-6-100:LNodeInputs ${id}="inputs">
									<eIEC61850-6-100:SourceRef input="Block" inputInst="1" pLN="PTRC" pDO="Tr" service="GOOSE" uuid="source-ref-uuid" ${id}="source-ref"/>
								</eIEC61850-6-100:LNodeInputs>
								<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
									<eIEC61850-6-100:ControlRef output="Trip" outputInst="1" pLN="XCBR" pDO="Pos" uuid="control-ref-uuid" ${id}="control-ref"/>
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
						<GeneralEquipment name="GE1" type="AXN" uuid="ge-uuid" ${id}="ge"/>
						<ConductingEquipment name="QA9" type="CBR" uuid="qa9-uuid" ${id}="qa9"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The same function whose kept sections name elements of the bay outside it: what the FSD keeps of them. */
const reachingOutXml = fullFunctionXml
	.replace(
		'relation="S1/V1/B1/Prot/GE1" relationUuid="ge-uuid"',
		'relation="S1/V1/B1/QA1" relationUuid="breaker-uuid"',
	)
	.replace(
		'element="S1/V1/B1/Prot" elementUuid="fn-uuid"',
		'element="S1/V1/B1/Other" elementUuid="other-uuid"',
	)
	.replace(
		'input="Block" inputInst="1"',
		'input="Block" inputInst="1" source="S1/V1/B1/Other/PTRC1" sourceLNodeUuid="other-lnode-uuid"',
	)
	.replace(
		`<Bay ${id}="bay1" name="B1">`,
		[
			`<Bay ${id}="bay1" name="B1">`,
			`<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="breaker"/>`,
			`<Function name="Other" uuid="other-uuid" ${id}="other">`,
			`<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="other-lnode-uuid" ${id}="other-lnode"/>`,
			`</Function>`,
		].join(''),
	)

describe('fsd: a kept section naming what the FSD does not hold', () => {
	const testCases: SclTest.TestCases<ExtractFunctionCase> = {
		'a relation to a breaker of the bay, a variable on another function, an input from it': {
			sourceXml: reachingOutXml,
			targetXml: emptyTargetXml,
			functionId: 'func1',
			expectedQueries: [
				// an input keeps what it asks for, without a source: the source is the instance's to bind
				'//v2019C1:LNodeInputs/v2019C1:SourceRef[@input="Block"][not(@sourceLNodeUuid)]',
			],
			unexpectedQueries: [
				'//v2019C1:PowerSystemRelation',
				'//v2019C1:VariableApplyTo',
				'//default:Function[@name="Other"]',
			],
		},
	}

	runSclTestCases.withExport<ExtractFunctionCase>({ testCases, act: extractFunction })
})

/** The function holding every optional section: kept by default, each left out alone when asked. */
describe('fsd: the optional sections of the function', () => {
	const sections = Object.keys(SECTION_QUERIES) as FunctionSection[]
	const testCases: SclTest.TestCases<ExtractFunctionCase> = {
		'no sections given → every one kept': {
			sourceXml: fullFunctionXml,
			targetXml: emptyTargetXml,
			functionId: 'func1',
			expectedQueries: sections.map((section) => SECTION_QUERIES[section].present),
		},
		...Object.fromEntries(
			sections.map((section) => {
				const gone = [section, ...(GOES_WITH[section] ?? [])]
				return [
					`${section} left out → only it is absent`,
					{
						sourceXml: fullFunctionXml,
						targetXml: emptyTargetXml,
						functionId: 'func1',
						sections: { [section]: false },
						expectedQueries: sections
							.filter((other) => !gone.includes(other))
							.map((other) => SECTION_QUERIES[other].present),
						unexpectedQueries: gone.map((other) => SECTION_QUERIES[other].absent),
					},
				]
			}),
		),
	}

	runSclTestCases.withExport<ExtractFunctionCase>({ testCases, act: extractFunction })
})

type ExtractFunctionCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	functionId: string
	sections?: FunctionSections
}

async function extractFunction({
	source,
	target,
	testCase,
}: SclTest.ActParams<ExtractFunctionCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function extractFsd(tx) {
		await fsd(tx, {
			sourceQuery: source.query,
			functionRef: { tagName: 'Function', id: testCase.functionId },
			tool: 'TEST',
			who: 'test',
			...(testCase.sections ? { sections: testCase.sections } : {}),
		})
	})
	return { assertOn: 'target' }
}
