import { writeIdentity } from './write-identity'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IdentityMode } from './write-identity.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type MappingSpec = {
	/** id of the (already cloned) target record to stamp/strip. */
	targetId: string
	tagName: string
	/** The original source record's lineage attributes (as carried by a clone mapping). */
	sourceAttributes: { uuid?: string; templateUuid?: string; originUuid?: string }
}

type Expected = {
	tagName: string
	targetId: string
	templateUuid?: string
	originUuid?: string
}

type TestCase = SclTest.BaseXmlTestCase & {
	mode: IdentityMode
	mappings: MappingSpec[]
	expected: Expected[]
}

describe('writeIdentity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'keep → lineage untouched': {
			sourceXml: functionDoc('fn-1', { templateUuid: 'orig-tpl' }),
			mode: 'keep',
			mappings: [{ targetId: 'fn-1', tagName: 'Function', sourceAttributes: { uuid: 'src-uuid' } }],
			expected: [{ tagName: 'Function', targetId: 'fn-1', templateUuid: 'orig-tpl' }],
		},

		'stamp-template on a single-level element (Function) → templateUuid set, no originUuid': {
			sourceXml: functionDoc('fn-1', {}),
			mode: 'stamp-template',
			mappings: [
				{
					targetId: 'fn-1',
					tagName: 'Function',
					sourceAttributes: { uuid: 'fn-src-uuid', templateUuid: 'fn-src-tpl' },
				},
			],
			expected: [{ tagName: 'Function', targetId: 'fn-1', templateUuid: 'fn-src-uuid' }],
		},

		'stamp-template on a two-level element (AllocationRole) → templateUuid ← source.uuid, originUuid ← source.templateUuid':
			{
				sourceXml: allocationRoleDoc('ar-1'),
				mode: 'stamp-template',
				mappings: [
					{
						targetId: 'ar-1',
						tagName: 'AllocationRole',
						sourceAttributes: { uuid: 'ar-src-uuid', templateUuid: 'ar-src-tpl' },
					},
				],
				expected: [
					{
						tagName: 'AllocationRole',
						targetId: 'ar-1',
						templateUuid: 'ar-src-uuid',
						originUuid: 'ar-src-tpl',
					},
				],
			},

		'stamp-template when source already has originUuid → no origin shift': {
			sourceXml: allocationRoleDoc('ar-1'),
			mode: 'stamp-template',
			mappings: [
				{
					targetId: 'ar-1',
					tagName: 'AllocationRole',
					sourceAttributes: {
						uuid: 'ar-src-uuid',
						templateUuid: 'ar-src-tpl',
						originUuid: 'ar-src-origin',
					},
				},
			],
			expected: [{ tagName: 'AllocationRole', targetId: 'ar-1', templateUuid: 'ar-src-uuid' }],
		},

		'strip → templateUuid removed': {
			sourceXml: functionDoc('fn-1', { templateUuid: 'tpl' }),
			mode: 'strip',
			mappings: [{ targetId: 'fn-1', tagName: 'Function', sourceAttributes: {} }],
			expected: [{ tagName: 'Function', targetId: 'fn-1' }],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const mappings = testCase.mappings.map((mapping) => ({
			source: {
				tagName: mapping.tagName,
				id: `src-${mapping.targetId}`,
				attributes: toAttributes(mapping.sourceAttributes),
			},
			target: { tagName: mapping.tagName, id: mapping.targetId },
		})) as unknown as Scl.CloneMapping[]

		await source.transaction(async (tx) => {
			await writeIdentity(tx, { mappings, mode: testCase.mode })
		})

		for (const expected of testCase.expected) {
			const ref = {
				tagName: expected.tagName,
				id: expected.targetId,
			} as unknown as Scl.Ref<Scl.ElementsOf>
			const attributes = (await source.query.getAttributes(ref)) as Record<
				string,
				string | undefined
			>
			expect(attributes.templateUuid || undefined).toBe(expected.templateUuid)
			expect(attributes.originUuid || undefined).toBe(expected.originUuid)
		}

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

function toAttributes(spec: Record<string, string | undefined>): { name: string; value: string }[] {
	return Object.entries(spec)
		.filter((entry): entry is [string, string] => entry[1] !== undefined)
		.map(([name, value]) => ({ name, value }))
}

function functionDoc(functionId: string, lineage: { templateUuid?: string }): string {
	const templateUuid = lineage.templateUuid ? `templateUuid="${lineage.templateUuid}"` : ''
	return /* xml */ `
		<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
			<Substation ${id}="sub" name="S1">
				<VoltageLevel ${id}="vl" name="V1">
					<Bay ${id}="bay" name="B1">
						<Function ${id}="${functionId}" name="F1" uuid="fresh-uuid" ${templateUuid}/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

function allocationRoleDoc(allocationRoleId: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
			<Substation ${id}="sub" name="S1">
				<Private ${id}="sub-priv" type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole ${id}="${allocationRoleId}" name="R1" uuid="fresh-uuid"/>
				</Private>
			</Substation>
		</SCL>
	`
}
