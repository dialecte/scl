import { contribute, describeContribution } from './contribute'

import { describe, expect } from 'vitest'

import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type { SclTest } from '@/v2019C1/test'

// A source element the project shares is poured into the project's element it lands on: a container lands on the
// project's of its lineage or name, nothing the project holds is rewritten, a reference is the placement's own unless
// the project's child already names the very element it names, and one naming what the placement does not place is
// left out. The report reads the same answer.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceCategory = { tagName: 'FunctionCategory', id: 'category-s' } as Scl.Ref<Scl.ElementsOf>
const projectCategory = { tagName: 'FunctionCategory', id: 'category-t' } as Scl.Ref<Scl.ElementsOf>

/** A category nesting its references in a sub-category, classifying two functions of the file. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="TEMPLATE" uuid="substation-source" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="HV Interface" desc="template" uuid="category-source" ${id}="category-s">
					<eIEC61850-6-100:SubCategory name="Interface" desc="template" uuid="sub-category-source" ${id}="sub-category-s">
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Breaker" functionUuid="breaker-source" ${id}="breaker-ref-s"/>
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/Disconnector" functionUuid="disconnector-source" ${id}="disconnector-ref-s"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<Function name="Breaker" uuid="breaker-source" ${id}="breaker-s"/>
			<Function name="Disconnector" uuid="disconnector-source" ${id}="disconnector-s"/>
		</Substation>
	</SCL>
`

/**
 * The project's category of that name, its sub-category of that name holding the reference of an earlier instance of
 * the breaker; the breaker's instance, and another one when `secondBreaker`.
 */
function projectXml(params: { subCategoryLineage?: string; secondBreaker?: boolean } = {}): string {
	const lineage = params.subCategoryLineage ? ` templateUuid="${params.subCategoryLineage}"` : ''
	const secondBreaker = params.secondBreaker
		? /* xml */ `<Function name="Breaker_1" uuid="breaker-second" templateUuid="breaker-source" ${id}="breaker-second-t"/>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" uuid="substation-project" ${id}="substation-t">
				<Private type="eIEC61850-6-100" ${id}="private-t">
					<eIEC61850-6-100:FunctionCategory name="HV Interface" desc="project" uuid="category-project" ${id}="category-t">
						<eIEC61850-6-100:SubCategory name="Interface" desc="project" uuid="sub-category-project"${lineage} ${id}="sub-category-t">
							<eIEC61850-6-100:FunctionCatRef function="S1/Breaker" functionUuid="breaker-first" ${id}="breaker-ref-t"/>
						</eIEC61850-6-100:SubCategory>
					</eIEC61850-6-100:FunctionCategory>
				</Private>
				<Function name="Breaker" uuid="breaker-first" templateUuid="breaker-source" ${id}="breaker-first-t"/>
				${secondBreaker}
			</Substation>
		</SCL>
	`
}

const SUB_CATEGORY = '//v2019C1:SubCategory[@name="Interface"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the placement places, by source uuid. */
	scope: string[]
	/** Source elements placed onto elements of the project: by source uuid, the project element's record id. */
	placedOnto?: Record<string, string>
	/** The source elements the report lists added, sorted. */
	listed: string[]
	/** The placement pours the element twice (two of its functions carry it) before it finalizes. */
	pouredTwice?: true
}

describe('contribute — a source element the project shares poured into the project element it lands on', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a second breaker placed → its reference lands in the project sub-category of that name, nothing rewritten':
			{
				sourceXml,
				targetXml: projectXml({ secondBreaker: true }),
				scope: ['breaker-source'],
				placedOnto: { 'breaker-source': 'breaker-second-t' },
				// the reference names the second breaker: the project's sub-category already names the first one
				listed: ['breaker-ref-s'],
				expectedQueries: [
					`${SUB_CATEGORY}[@desc="project"][count(v2019C1:FunctionCatRef)=2]`,
					`${SUB_CATEGORY}/v2019C1:FunctionCatRef[@functionUuid="breaker-second"]`,
					'//v2019C1:FunctionCategory[@name="HV Interface"][@desc="project"]',
				],
				unexpectedQueries: [`(${SUB_CATEGORY})[2]`],
			},
		'the sub-category the project holds carries the template one as lineage under another name → it receives it':
			{
				sourceXml,
				targetXml: projectXml({
					subCategoryLineage: 'sub-category-source',
					secondBreaker: true,
				}).replace('name="Interface" desc="project"', 'name="Renamed" desc="project"'),
				scope: ['breaker-source'],
				placedOnto: { 'breaker-source': 'breaker-second-t' },
				listed: ['breaker-ref-s'],
				expectedQueries: [
					'//v2019C1:SubCategory[@name="Renamed"][@desc="project"][count(v2019C1:FunctionCatRef)=2]',
				],
				unexpectedQueries: [SUB_CATEGORY],
			},
		'the reference names the very element the project sub-category already names → not written twice':
			{
				sourceXml,
				targetXml: projectXml(),
				scope: ['breaker-source'],
				placedOnto: { 'breaker-source': 'breaker-first-t' },
				listed: [],
				expectedQueries: [`${SUB_CATEGORY}[count(v2019C1:FunctionCatRef)=1]`],
			},
		'a reference naming what the placement does not place → neither listed nor written': {
			sourceXml,
			targetXml: projectXml({ secondBreaker: true }),
			scope: ['breaker-source'],
			placedOnto: { 'breaker-source': 'breaker-second-t' },
			listed: ['breaker-ref-s'],
			unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="TEMPLATE/Disconnector"]'],
		},
		'a sub-category without uuid → it lands on the project sub-category of its name, never on another by position':
			{
				sourceXml: sourceXml.replace(' uuid="sub-category-source"', ''),
				targetXml: projectXml({ secondBreaker: true }).replace(
					'<eIEC61850-6-100:SubCategory name="Interface"',
					`<eIEC61850-6-100:SubCategory name="Other" uuid="other-project" ${id}="other-t"/>
						<eIEC61850-6-100:SubCategory name="Interface"`,
				),
				scope: ['breaker-source'],
				placedOnto: { 'breaker-source': 'breaker-second-t' },
				listed: ['breaker-ref-s'],
				expectedQueries: [`${SUB_CATEGORY}[count(v2019C1:FunctionCatRef)=2]`],
				unexpectedQueries: ['//v2019C1:SubCategory[@name="Other"]/v2019C1:FunctionCatRef'],
			},
		'poured twice by one placement → its reference written once': {
			sourceXml,
			targetXml: projectXml({ secondBreaker: true }),
			scope: ['breaker-source'],
			placedOnto: { 'breaker-source': 'breaker-second-t' },
			pouredTwice: true,
			listed: ['breaker-ref-s'],
			expectedQueries: [`${SUB_CATEGORY}[count(v2019C1:FunctionCatRef)=2]`],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placedOnto: RedirectMapping[] = []
		for (const [sourceUuid, recordId] of Object.entries(testCase.placedOnto ?? {})) {
			placedOnto.push({ sourceUuid, target: { tagName: 'Function', id: recordId } })
		}
		const params = {
			sourceQuery: source.query,
			source: sourceCategory,
			target: projectCategory,
			scope: new Set(testCase.scope),
			matchKey: 'templateUuid' as const,
			redirectMappings: placedOnto,
		}

		const listed = await describeContribution(target.query, params)
		expect(collectAdded(listed.root).sort(), 'report').toEqual(testCase.listed)

		await target.transaction(async function write(tx) {
			const contributed = await contribute(tx, params)
			if (testCase.pouredTwice) {
				const again = await contribute(tx, params)
				contributed.cloneMappings.push(...again.cloneMappings)
			}
			// the placement finalizes what it placed: the references it added name the project's elements
			await finalizeClonedIdentity(tx, {
				cloneMappings: contributed.cloneMappings,
				mode: 'stamp-template',
				redirectMappings: [...placedOnto, ...contributed.redirectMappings],
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('contribute — a copy pours the shared element into itself', () => {
	type CopyCase = SclTest.BaseXmlTestCase & { targetXml: string }
	const projectWithCategory = /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" uuid="substation-project" ${id}="substation-t">
				<Private type="eIEC61850-6-100" ${id}="private-t">
					<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-project" ${id}="category-t">
						<eIEC61850-6-100:FunctionCatRef function="S1/Meas" functionUuid="meas-original" ${id}="meas-ref-t"/>
						<eIEC61850-6-100:FunctionCatRef function="S1/Other" functionUuid="other-original" ${id}="other-ref-t"/>
					</eIEC61850-6-100:FunctionCategory>
				</Private>
				<Function name="Meas" uuid="meas-original" ${id}="meas-t"/>
				<Function name="Other" uuid="other-original" ${id}="other-t"/>
			</Substation>
		</SCL>
	`
	const testCases: SclTest.TestCases<CopyCase> = {
		'a copied function → the category gains one reference for the copy, the original ones untouched':
			{
				sourceXml: projectWithCategory,
				targetXml: projectWithCategory,
				expectedQueries: [
					'//v2019C1:FunctionCategory[count(v2019C1:FunctionCatRef)=3]',
					'//v2019C1:FunctionCatRef[@functionUuid="meas-copy"]',
					'//v2019C1:FunctionCatRef[@functionUuid="meas-original"]',
				],
				unexpectedQueries: ['(//v2019C1:FunctionCatRef[@functionUuid="other-original"])[2]'],
			},
	}

	async function act({ target }: SclTest.ActParams<CopyCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function copy(tx) {
			const copied = await tx.addChild(
				{ tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>,
				{ tagName: 'Function', attributes: { name: 'Meas_1', uuid: 'meas-copy' } },
			)
			const contributed = await contribute(tx, {
				sourceQuery: target.query,
				source: projectCategory,
				target: projectCategory,
				scope: new Set(['meas-original']),
				matchKey: 'uuid',
				sourceIsProject: true,
			})
			// the copy finalizes what it placed: a reference to the original names its copy
			await finalizeClonedIdentity(tx, {
				cloneMappings: contributed.cloneMappings,
				mode: 'keep',
				redirectMappings: [
					{ sourceUuid: 'meas-original', target: { tagName: 'Function', id: copied.id } },
				],
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The source elements a diff adds, at any depth. */
function collectAdded(node: DiffNode, out: string[] = []): string[] {
	if (node.change === 'added' && node.sourceRef?.id) out.push(node.sourceRef.id)
	for (const child of node.children) collectAdded(child, out)
	return out
}
