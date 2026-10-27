import { fsd } from './fsd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type {
	FunctionPlacement,
	FunctionSection,
	FunctionSections,
	TemplateLink,
} from './extract.types'
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

/** The sections a function holds at its own level (not in its logical nodes), and its categories: all left out. */
const FUNCTION_LEVEL_SECTIONS_OFF: FunctionSections = {
	labels: false,
	processResources: false,
	powerSystemRelations: false,
	behaviorDescriptions: false,
	variables: false,
	categories: false,
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

/** A function at each level of a substation, the bay's with a subfunction. */
const levelsXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
		<Substation ${id}="sub1" name="S1">
			<VoltageLevel ${id}="vl1" name="V1">
				<Bay ${id}="bay1" name="B1">
					<Function ${id}="bay-fn" name="Prot" uuid="prot-uuid">
						<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="ptoc-uuid" ${id}="ptoc"/>
						<SubFunction ${id}="trip" name="Trip" uuid="trip-uuid">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ptrc-uuid" ${id}="ptrc"/>
						</SubFunction>
					</Function>
				</Bay>
				<Function ${id}="vl-fn" name="Busbar" uuid="busbar-uuid"/>
			</VoltageLevel>
			<Function ${id}="sub-fn" name="Station" uuid="station-uuid"/>
		</Substation>
	</SCL>
`

describe('fsd: where the function is placed', () => {
	const testCases: SclTest.TestCases<ExtractFunctionCase> = {
		'a bay function → below the TEMPLATE substation, voltage level and bay': {
			sourceXml: levelsXml,
			targetXml: emptyTargetXml,
			functionId: 'bay-fn',
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="TEMPLATE"]/default:Function[@name="Prot"]/default:SubFunction[@name="Trip"]',
			],
			unexpectedQueries: ['/default:SCL/default:Substation/default:Function'],
		},
		'a voltage level function → below the TEMPLATE voltage level, not in its bay': {
			sourceXml: levelsXml,
			targetXml: emptyTargetXml,
			functionId: 'vl-fn',
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:VoltageLevel[@name="TEMPLATE"]/default:Function[@name="Busbar"]',
			],
			unexpectedQueries: ['//default:Bay/default:Function'],
		},
		'a substation function → below the TEMPLATE substation, not in its voltage level': {
			sourceXml: levelsXml,
			targetXml: emptyTargetXml,
			functionId: 'sub-fn',
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:Function[@name="Station"]',
			],
			unexpectedQueries: ['//default:VoltageLevel/default:Function'],
		},
		'a subfunction → a function at the level of the function holding it': {
			sourceXml: levelsXml,
			targetXml: emptyTargetXml,
			functionId: 'trip',
			functionTag: 'SubFunction',
			expectedQueries: [
				'/default:SCL/default:Substation/default:VoltageLevel/default:Bay[@name="TEMPLATE"]/default:Function[@name="Trip"]',
			],
			unexpectedQueries: ['//default:SubFunction'],
		},
		"placement 'substation' → below the TEMPLATE substation, whatever its level": {
			sourceXml: levelsXml,
			targetXml: emptyTargetXml,
			functionId: 'bay-fn',
			placement: 'substation',
			expectedQueries: [
				'/default:SCL/default:Substation[@name="TEMPLATE"]/default:Function[@name="Prot"]/default:SubFunction[@name="Trip"]',
			],
			unexpectedQueries: ['//default:Bay/default:Function'],
		},
		"placement 'function-template' → a function template with no parent level, its subfunction a subfunction template":
			{
				sourceXml: levelsXml,
				targetXml: emptyTargetXml,
				functionId: 'bay-fn',
				placement: 'function-template',
				expectedQueries: [
					'/default:SCL/default:Private[@type="eIEC61850-6-100"]/v2019C1:FunctionTemplate[@name="Prot"]/v2019C1:LNode[@lnClass="PTOC"]',
					'//v2019C1:FunctionTemplate[@name="Prot"]/v2019C1:SubFunctionTemplate[@name="Trip"]/v2019C1:LNode[@lnClass="PTRC"]',
				],
				unexpectedQueries: ['//default:Substation', '//default:Function'],
			},
	}

	runSclTestCases.withExport<ExtractFunctionCase>({ testCases, act: extractFunction })
})

/** The bay function placed from an FSD: it records the file and carries the lineage. */
const fromFsdXml = levelsXml.replace(
	`<Function ${id}="bay-fn" name="Prot" uuid="prot-uuid">`,
	[
		`<Function ${id}="bay-fn" name="Prot" uuid="prot-uuid" templateUuid="prot-template">`,
		`<Private type="eIEC61850-6-100" ${id}="prot-private">`,
		`<eIEC61850-6-100:FunctionSclRef ${id}="prot-ref">`,
		`<eIEC61850-6-100:SclFileReference fileName="PROT" fileType="FSD" ${id}="prot-file"/>`,
		`</eIEC61850-6-100:FunctionSclRef>`,
		`</Private>`,
	].join(''),
)

describe('fsd: a function that sits in a line or a process', () => {
	for (const container of ['Line', 'Process'] as const) {
		it(`in a ${container}, at its own level → not available yet, nothing written`, async () => {
			const { source, target } = await createSclTestProject({
				sourceXml: levelsXml.replace(
					`</Substation>`,
					`</Substation><${container} name="L1" ${id}="container"><Function name="Feed" uuid="feed-uuid" ${id}="container-fn"/></${container}>`,
				),
				targetXml: emptyTargetXml,
			})
			if (!target) throw new Error('target required')

			const refusal = await target.document
				.transaction(async function extractAtItsLevel(tx) {
					await fsd(tx, {
						sourceQuery: source.document.query,
						functionRef: { tagName: 'Function', id: 'container-fn' },
						tool: 'TEST',
						who: 'test',
					})
				})
				.catch((error: unknown) => toDialecteError(error))

			expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'placement', value: 'source-level' },
			})
			expect(await target.document.query.getRecordsByTagName('Header')).toEqual([])
		})
	}
})

describe("fsd: placement 'function-template' and what a function template cannot hold", () => {
	it('a function classified in a category, a behaviour description, a vendor Private → refused, nothing written', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: fullFunctionXml.replace(
				`<Private type="eIEC61850-6-100" ${id}="fn-private">`,
				`<Private type="ACME-Id" ${id}="fn-acme">42</Private><Private type="eIEC61850-6-100" ${id}="fn-private">`,
			),
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const refusal = await target.document
			.transaction(async function extractAsFunctionTemplate(tx) {
				await fsd(tx, {
					sourceQuery: source.document.query,
					functionRef: { tagName: 'Function', id: 'func1' },
					tool: 'TEST',
					who: 'test',
					placement: 'function-template',
				})
			})
			.catch((error: unknown) => toDialecteError(error))

		expect(refusal?.key).toBe('FUNCTION_TEMPLATE_CANNOT_HOLD')
		expect(refusal?.meta?.tags).toEqual([
			'BehaviorDescription',
			'FunctionCategory',
			'Labels',
			'PowerSystemRelations',
			'Private',
			'ProcessResources',
			'Variable',
		])
		expect(await target.document.query.getRecordsByTagName('Header')).toEqual([])
	})

	it('the same function, those sections left out but the vendor Private → refused with the Private alone', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: fullFunctionXml.replace(
				`<Private type="eIEC61850-6-100" ${id}="fn-private">`,
				`<Private type="ACME-Id" ${id}="fn-acme">42</Private><Private type="eIEC61850-6-100" ${id}="fn-private">`,
			),
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const refusal = await target.document
			.transaction(async function extractAsFunctionTemplate(tx) {
				await fsd(tx, {
					sourceQuery: source.document.query,
					functionRef: { tagName: 'Function', id: 'func1' },
					tool: 'TEST',
					who: 'test',
					placement: 'function-template',
					sections: FUNCTION_LEVEL_SECTIONS_OFF,
				})
			})
			.catch((error: unknown) => toDialecteError(error))

		expect(refusal?.meta?.tags).toEqual(['Private'])
	})

	it('a subfunction holding a vendor Private and the file it was placed from → refused with both', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: levelsXml.replace(
				`<SubFunction ${id}="trip" name="Trip" uuid="trip-uuid">`,
				[
					`<SubFunction ${id}="trip" name="Trip" uuid="trip-uuid" templateUuid="trip-template">`,
					`<Private type="ACME-Id" ${id}="trip-acme">7</Private>`,
					`<Private type="eIEC61850-6-100" ${id}="trip-private">`,
					`<eIEC61850-6-100:FunctionSclRef ${id}="trip-ref">`,
					`<eIEC61850-6-100:SclFileReference fileName="TRIP" fileType="FSD" ${id}="trip-file"/>`,
					`</eIEC61850-6-100:FunctionSclRef>`,
					`</Private>`,
				].join(''),
			),
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const refusal = await target.document
			.transaction(async function extractAsFunctionTemplate(tx) {
				await fsd(tx, {
					sourceQuery: source.document.query,
					functionRef: { tagName: 'Function', id: 'bay-fn' },
					tool: 'TEST',
					who: 'test',
					placement: 'function-template',
				})
			})
			.catch((error: unknown) => toDialecteError(error))

		expect(refusal?.meta?.tags).toEqual(['FunctionSclRef', 'Private'])
	})

	it('a function placed from an FSD, its template link kept → refused: its file reference has no place', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: fromFsdXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const refusal = await target.document
			.transaction(async function extractAsFunctionTemplate(tx) {
				await fsd(tx, {
					sourceQuery: source.document.query,
					functionRef: { tagName: 'Function', id: 'bay-fn' },
					tool: 'TEST',
					who: 'test',
					placement: 'function-template',
					templateLink: 'keep',
				})
			})
			.catch((error: unknown) => toDialecteError(error))

		expect(refusal?.meta?.tags).toEqual(['FunctionSclRef'])
	})

	const sectionsOffCases: SclTest.TestCases<ExtractFunctionCase> = {
		'a function placed from an FSD, its template link broken → a function template without the file reference':
			{
				sourceXml: fromFsdXml,
				targetXml: emptyTargetXml,
				functionId: 'bay-fn',
				placement: 'function-template',
				templateLink: 'break',
				expectedQueries: ['//v2019C1:FunctionTemplate[@name="Prot"][not(@templateUuid)]'],
				unexpectedQueries: ['//v2019C1:SclFileReference'],
			},
		'the sections held at the function left out → a function template keeping what its logical nodes specify':
			{
				sourceXml: fullFunctionXml,
				targetXml: emptyTargetXml,
				functionId: 'func1',
				placement: 'function-template',
				sections: FUNCTION_LEVEL_SECTIONS_OFF,
				expectedQueries: [
					'//v2019C1:FunctionTemplate[@name="Prot"]/v2019C1:LNode/default:Private/v2019C1:DOS[@name="Pos"]',
					'//v2019C1:FunctionTemplate[@name="Prot"]/v2019C1:LNode/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef',
					'//v2019C1:FunctionTemplate[@name="Prot"]/v2019C1:GeneralEquipment[@name="GE1"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionCategory', '//default:Substation'],
			},
	}

	runSclTestCases.withExport<ExtractFunctionCase>({
		testCases: sectionsOffCases,
		act: extractFunction,
	})
})

type ExtractFunctionCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	functionId: string
	functionTag?: 'Function' | 'SubFunction'
	sections?: FunctionSections
	placement?: FunctionPlacement
	templateLink?: TemplateLink
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
			functionRef: { tagName: testCase.functionTag ?? 'Function', id: testCase.functionId },
			tool: 'TEST',
			who: 'test',
			...(testCase.sections ? { sections: testCase.sections } : {}),
			...(testCase.placement ? { placement: testCase.placement } : {}),
			...(testCase.templateLink ? { templateLink: testCase.templateLink } : {}),
		})
	})
	return { assertOn: 'target' }
}
