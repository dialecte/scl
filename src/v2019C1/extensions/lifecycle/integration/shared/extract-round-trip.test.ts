import { findByName, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { LINEAGE } from '@/v2019C1/extensions/lifecycle/constraints/classify-attribute.constants'
import { asd, fsd, ssd } from '@/v2019C1/extensions/lifecycle/extract/transaction'
import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants/type-id-pairs'
import { ROOT_ANCHORS } from '@/v2019C1/extensions/reference/transaction/write-provenance.constants'
import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	FunctionPlacement,
	FunctionSections,
} from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

// An element extracted to a template file, then instantiated in a project of the same names, gives back the element: the
// same elements, attributes and values, and references naming the same elements — but its identity (uuids, lineage, the
// file it records).

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The file written and the element extracted, by its tag and name in the project. */
	extract: { verb: 'fsd'; placement: FunctionPlacement } | { verb: 'asd' } | { verb: 'ssd' }
	/** The elements compared, by their tag and name. */
	elements: { tagName: Scl.ElementsOf; name: string }[]
}

/** A bay of the project: an application composing a protection function, its role allocated, its breaker. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file" ${id}="project-header"/>
		<Substation name="S1" ${id}="s1">
			<Private type="eIEC61850-6-100" ${id}="s1-private">
				<eIEC61850-6-100:AllocationRole name="PROT" uuid="prot-role" ${id}="prot-role">
					<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="prot" ${id}="prot-role-ref"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
			<VoltageLevel name="V1" ${id}="v1">
				<Voltage unit="V" multiplier="k" ${id}="v1-voltage">110</Voltage>
				<Bay name="B1" uuid="b1" ${id}="b1">
					<Private type="eIEC61850-6-100" ${id}="b1-private">
						<eIEC61850-6-100:Application name="Feeder" type="Protection" uuid="feeder" ${id}="feeder">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="feeder-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="feeder-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="prot" ${id}="feeder-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/PROT" allocationRoleUuid="prot-role" ${id}="feeder-allocation"/>
						</eIEC61850-6-100:Application>
						<eIEC61850-6-100:Variable name="PICKUP" value="1.2" uuid="pickup" ${id}="pickup">
							<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1/Prot" elementUuid="prot" ${id}="pickup-apply"/>
						</eIEC61850-6-100:Variable>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="qa1" ${id}="qa1"/>
					<Function name="Prot" desc="Protection" uuid="prot" ${id}="prot">
						<LNode iedName="None" lnClass="PTOC" lnInst="1" lnType="PTOC_Type" uuid="ptoc" ${id}="ptoc">
							<Private type="eIEC61850-6-100" ${id}="ptoc-private">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="PTOC" sLnInst="1" ${id}="ptoc-spec"/>
								<eIEC61850-6-100:DOS name="Op" ${id}="ptoc-dos"/>
							</Private>
						</LNode>
						<SubFunction name="Trip" uuid="trip" ${id}="trip">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_Type" uuid="ptrc" ${id}="ptrc">
								<Private type="eIEC61850-6-100" ${id}="ptrc-private">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="PTRC" sLnInst="1" ${id}="ptrc-spec"/>
								</Private>
							</LNode>
						</SubFunction>
						<GeneralEquipment name="GE1" type="AXN" uuid="ge1" ${id}="ge1"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="types">
			<LNodeType id="PTOC_Type" lnClass="PTOC" ${id}="ptoc-type">
				<DO name="Op" type="ACT_Type" ${id}="ptoc-op"/>
			</LNodeType>
			<LNodeType id="PTRC_Type" lnClass="PTRC" ${id}="ptrc-type">
				<DO name="Tr" type="ACT_Type" ${id}="ptrc-tr"/>
			</LNodeType>
			<DOType id="ACT_Type" cdc="ACT" ${id}="act-type">
				<DA name="general" bType="BOOLEAN" fc="ST" ${id}="act-general"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

/** A project of the same names, the bay empty: where the template is instantiated. */
const emptyBayXml = /* xml */ `
	<SCL ${ns} ${id}="other">
		<Header id="other" uuid="other-file" ${id}="other-header"/>
		<Substation name="S1" ${id}="other-s1">
			<VoltageLevel name="V1" ${id}="other-v1">
				<Voltage unit="V" multiplier="k" ${id}="other-v1-voltage">110</Voltage>
				<Bay name="B1" ${id}="other-b1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project of the same substation and voltage level, no bay: where an SSD's bay is instantiated. */
const emptyVoltageLevelXml = /* xml */ `
	<SCL ${ns} ${id}="other">
		<Header id="other" uuid="other-file" ${id}="other-header"/>
		<Substation name="S1" ${id}="other-s1">
			<VoltageLevel name="V1" ${id}="other-v1">
				<Voltage unit="V" multiplier="k" ${id}="other-v1-voltage">110</Voltage>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const emptyXml = /* xml */ `<SCL ${ns} ${id}="extracted-root" version="2007" revision="C" release="5"/>`

/** What an instance holds besides the template's content: the file it records. */
const PROVENANCE_TAGS = new Set<string>(Object.values(ROOT_ANCHORS).map((anchor) => anchor.tag))

describe('extract, then instantiate: the element comes back, modulo its identity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fsd, at its own level': {
			sourceXml: projectXml,
			targetXml: emptyBayXml,
			extract: { verb: 'fsd', placement: 'source-level' },
			elements: [{ tagName: 'Function', name: 'Prot' }],
		},
		'fsd, below the TEMPLATE substation': {
			sourceXml: projectXml,
			targetXml: emptyBayXml,
			extract: { verb: 'fsd', placement: 'substation' },
			elements: [{ tagName: 'Function', name: 'Prot' }],
		},
		'fsd, as a function template': {
			sourceXml: projectXml,
			targetXml: emptyBayXml,
			extract: { verb: 'fsd', placement: 'function-template' },
			elements: [{ tagName: 'Function', name: 'Prot' }],
		},
		// the bay's breaker is not the application's: an application brings what it references
		'asd: the application and the function it composes': {
			sourceXml: projectXml,
			targetXml: emptyBayXml,
			extract: { verb: 'asd' },
			elements: [
				{ tagName: 'Application', name: 'Feeder' },
				{ tagName: 'Function', name: 'Prot' },
				{ tagName: 'AllocationRole', name: 'PROT' },
				{ tagName: 'Variable', name: 'PICKUP' },
			],
		},
		// the bay's variable is the bay's: it comes back with it
		'ssd: the bay': {
			sourceXml: projectXml,
			targetXml: emptyVoltageLevelXml,
			extract: { verb: 'ssd' },
			elements: [{ tagName: 'Bay', name: 'B1' }],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted' })
		const { extract } = testCase
		await extracted.transaction(async function extractTemplate(tx) {
			const common = { sourceQuery: source.query, tool: 'TEST', who: 'test' }
			if (extract.verb === 'fsd') {
				const functionRef = await findByName(source.query, { tagName: 'Function', name: 'Prot' })
				await fsd(tx, { ...common, functionRef, placement: extract.placement })
			} else if (extract.verb === 'asd') {
				const applicationRef = await findByName(source.query, {
					tagName: 'Application',
					name: 'Feeder',
				})
				await asd(tx, { ...common, applicationRef })
			} else {
				const scopeRef = await findByName(source.query, { tagName: 'Bay', name: 'B1' })
				await ssd(tx, { ...common, scopeRef })
			}
		})

		const placement = await instantiationTarget({ testCase, extracted, target })
		await reportAndApply({ document: target, lifecycle: placement })

		const sourcePaths = await indexUuids(source.query)
		const targetPaths = await indexUuids(target.query)
		for (const element of testCase.elements) {
			const before = await canonicalTree(source.query, { element, paths: sourcePaths })
			const after = await canonicalTree(target.query, { element, paths: targetPaths })
			expect(after, `${element.tagName} ${element.name}`).toEqual(before)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * The project with a breaker inside the function, holding a logical node of a type of its own (its data object type
 * with it): the types an extract writes depend on what it clones of the function.
 */
const projectWithBreakerLogicalNodeXml = projectXml
	.replace(
		`<GeneralEquipment name="GE1" type="AXN" uuid="ge1" ${id}="ge1"/>`,
		`<GeneralEquipment name="GE1" type="AXN" uuid="ge1" ${id}="ge1"/>
						<ConductingEquipment name="QF1" type="CBR" uuid="qf1" ${id}="qf1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_Type" uuid="xcbr" ${id}="xcbr"/>
						</ConductingEquipment>`,
	)
	.replace(
		`<DOType id="ACT_Type"`,
		`<LNodeType id="XCBR_Type" lnClass="XCBR" ${id}="xcbr-type">
				<DO name="Pos" type="DPC_Type" ${id}="xcbr-pos"/>
			</LNodeType>
			<DOType id="ACT_Type"`,
	)
	.replace(
		`</DataTypeTemplates>`,
		`<DOType id="DPC_Type" cdc="DPC" ${id}="dpc-type">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="dpc-stval"/>
			</DOType>
		</DataTypeTemplates>`,
	)

describe('extract: the file holds no type that nothing in it names', () => {
	type TypesCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		extract:
			| { verb: 'fsd'; placement: FunctionPlacement; sections?: FunctionSections }
			| { verb: 'asd'; sections?: FunctionSections }
			| { verb: 'ssd' }
		/** The logical node types the file holds: the invariant says nothing of a file holding no type at all. */
		expectedLogicalNodeTypes: string[]
	}

	const allThree = ['PTOC_Type', 'PTRC_Type', 'XCBR_Type']
	const withoutBreaker = ['PTOC_Type', 'PTRC_Type']

	const testCases: SclTest.TestCases<TypesCase> = {
		'fsd, at its own level, every section → the breaker and its type are written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'fsd', placement: 'source-level' },
			expectedLogicalNodeTypes: allThree,
		},
		'fsd, below the TEMPLATE substation, every section → the breaker and its type are written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'fsd', placement: 'substation' },
			expectedLogicalNodeTypes: allThree,
		},
		'fsd, as a function template, every section → the breaker and its type are written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'fsd', placement: 'function-template' },
			expectedLogicalNodeTypes: allThree,
		},
		'asd, every section → the breaker and its type are written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'asd' },
			expectedLogicalNodeTypes: allThree,
		},
		'ssd: the bay → the breaker and its type are written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'ssd' },
			expectedLogicalNodeTypes: allThree,
		},
		'fsd, equipment left out → no type of the breaker is written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'fsd', placement: 'source-level', sections: { equipment: false } },
			expectedLogicalNodeTypes: withoutBreaker,
		},
		'asd, equipment left out → no type of the breaker is written': {
			sourceXml: projectWithBreakerLogicalNodeXml,
			targetXml: emptyXml,
			extract: { verb: 'asd', sections: { equipment: false } },
			expectedLogicalNodeTypes: withoutBreaker,
		},
	}

	async function act({
		testCase,
		project,
		source,
	}: SclTest.ActParams<TypesCase>): Promise<SclTest.ActResult> {
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted' })
		const { extract } = testCase
		await extracted.transaction(async function extractTemplate(tx) {
			const common = { sourceQuery: source.query, tool: 'TEST', who: 'test' }
			if (extract.verb === 'fsd') {
				const functionRef = await findByName(source.query, { tagName: 'Function', name: 'Prot' })
				await fsd(tx, {
					...common,
					functionRef,
					placement: extract.placement,
					sections: extract.sections,
				})
			} else if (extract.verb === 'asd') {
				const applicationRef = await findByName(source.query, {
					tagName: 'Application',
					name: 'Feeder',
				})
				await asd(tx, { ...common, applicationRef, sections: extract.sections })
			} else {
				const scopeRef = await findByName(source.query, { tagName: 'Bay', name: 'B1' })
				await ssd(tx, { ...common, scopeRef })
			}
		})

		const typesNamedByNothing = await typesWithoutReferrer(extracted.query)
		expect(typesNamedByNothing, 'types nothing in the file names').toEqual([])
		const logicalNodeTypes = await extracted.query.getRecordsByTagName('LNodeType')
		expect(
			logicalNodeTypes
				.map((record) => readAttribute({ record, name: 'id', defaults: 'none' }))
				.sort(),
			'the types the file holds',
		).toEqual(testCase.expectedLogicalNodeTypes)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * The types of a document nothing names, `<tag> <id>`, sorted: a type is named by the referrers of the registry of type
 * references (a logical node, a data object, a data attribute), whatever the other attributes of the referrer say.
 */
async function typesWithoutReferrer(query: Core.Query<Config>): Promise<string[]> {
	const named = new Set<string>()
	const targets = new Set<string>()
	for (const [referrerTag, pairs] of Object.entries(TYPE_ID_REFERENCE_PAIRS)) {
		const referrers = await query.getRecordsByTagName(referrerTag as Scl.ElementsOf)
		for (const pair of pairs) {
			targets.add(pair.target)
			for (const record of referrers) {
				const typeId = readAttribute({ record, name: pair.attribute, defaults: 'none' })
				if (typeId) named.add(`${pair.target} ${typeId}`)
			}
		}
	}
	const unused: string[] = []
	for (const target of targets) {
		for (const record of await query.getRecordsByTagName(target as Scl.ElementsOf)) {
			const key = `${target} ${readAttribute({ record, name: 'id', defaults: 'none' })}`
			if (!named.has(key)) unused.push(key)
		}
	}
	return unused.sort()
}

/** The instantiation of the extracted file: its element, at the level of the project it was extracted from. */
async function instantiationTarget(params: {
	testCase: TestCase
	extracted: Scl.Document
	target: Scl.Document
}): Promise<Parameters<typeof reportAndApply>[0]['lifecycle']> {
	const { testCase, extracted, target } = params
	const sourceQuery = extracted.query
	switch (testCase.extract.verb) {
		case 'fsd': {
			const rootTag =
				testCase.extract.placement === 'function-template' ? 'FunctionTemplate' : 'Function'
			const ref = await findByName(sourceQuery, { tagName: rootTag, name: 'Prot' })
			const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B1' })
			return {
				verb: 'fsd',
				sourceQuery,
				ref: ref as Scl.Ref<'Function'> | Scl.Ref<'FunctionTemplate'>,
				anchor,
				scenario: 'instantiate',
			}
		}
		case 'asd': {
			const ref = await findByName(sourceQuery, { tagName: 'Application', name: 'Feeder' })
			const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B1' })
			return { verb: 'asd', sourceQuery, ref, anchor, scenario: 'instantiate' }
		}
		case 'ssd': {
			const ref = await findByName(sourceQuery, { tagName: 'Bay', name: 'B1' })
			const anchor = await findByName(target.query, { tagName: 'VoltageLevel', name: 'V1' })
			return { verb: 'ssd', sourceQuery, ref, anchor, scenario: 'instantiate' }
		}
	}
}

/**
 * An element as compared: its tag, its attributes but its identity — a reference's uuid read as the path of the element
 * it names —, its text, its children but the file references it records.
 */
type CanonicalElement = {
	tagName: string
	attributes: Record<string, string>
	value: string
	children: CanonicalElement[]
}

/** Each uuid of a document and the path of the element carrying it: tags and names from the root. */
async function indexUuids(query: Core.Query<Config>): Promise<Map<string, string>> {
	const root = (await query.any.getSnapshot({ as: 'tree' })) as AnyTreeRecord
	const paths = new Map<string, string>()
	await indexNode(query, { node: root, path: '', paths })
	return paths
}

async function indexNode(
	query: Core.Query<Config>,
	params: { node: AnyTreeRecord; path: string; paths: Map<string, string> },
): Promise<void> {
	const { node, paths } = params
	const { uuid, name } = await query.any.getAttributes(node)
	const path = `${params.path}/${node.tagName}${name ? `[${String(name)}]` : ''}`
	if (uuid) paths.set(String(uuid), path)
	for (const child of node.tree) await indexNode(query, { node: child, path, paths })
}

/** The element of a tag and name in a document, as compared. */
async function canonicalTree(
	query: Core.Query<Config>,
	params: {
		element: { tagName: Scl.ElementsOf; name: string }
		paths: ReadonlyMap<string, string>
	},
): Promise<CanonicalElement | undefined> {
	const ref = await findByName(query, params.element)
	const tree = await query.any.getTree(ref)
	return tree ? await canonicalize(query, { node: tree, paths: params.paths }) : undefined
}

/** An element as compared, its references read as the paths of what they name in its document. */
async function canonicalize(
	query: Core.Query<Config>,
	params: { node: AnyTreeRecord; paths: ReadonlyMap<string, string> },
): Promise<CanonicalElement> {
	const { node, paths } = params
	const attributes: Record<string, string> = {}
	const nodeAttributes = await query.any.getAttributes(node)
	for (const [name, value] of Object.entries(nodeAttributes)) {
		if (value === undefined || LINEAGE.has(name)) continue
		attributes[name] = name.endsWith('Uuid')
			? (paths.get(String(value)) ?? 'names nothing')
			: String(value)
	}
	const children: CanonicalElement[] = []
	for (const child of node.tree) {
		if (PROVENANCE_TAGS.has(child.tagName)) continue
		const canonicalChild = await canonicalize(query, { node: child, paths })
		children.push(canonicalChild)
	}
	return { tagName: node.tagName, attributes, value: node.value ?? '', children }
}
