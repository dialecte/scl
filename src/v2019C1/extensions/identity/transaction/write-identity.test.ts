// a function of an instance (bay B1 of a level template) holding an LNode, a subfunction and a variable, and the
// copies already placed (lineage as copied): into a function of the same template, into one of another template, onto a plain bay
import { writeIdentity } from './write-identity'

import { describe, expect, expectTypeOf, it } from 'vitest'

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
	/** The source record, when the case reads it in the document (a copy's parent). Default `src-<targetId>`. */
	sourceId?: string
	/** The original source record's lineage attributes (as carried by a clone mapping). */
	sourceAttributes: { uuid?: string; templateUuid?: string; originUuid?: string }
}

type Expected = {
	tagName: string
	targetId: string
	templateUuid?: string
	originUuid?: string
}

/** The write of the case; `strip` names source ids. */
type CaseWrite = { mode: 'stamp-template' | 'keep' } | { mode: 'strip'; unlinked: string[] }

type TestCase = SclTest.BaseXmlTestCase & {
	write: CaseWrite
	cloneMappings: MappingSpec[]
	expected: Expected[]
}

describe('writeIdentity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'keep → lineage untouched': {
			sourceXml: functionDoc('fn-1', { templateUuid: 'orig-tpl' }),
			write: { mode: 'keep' },
			cloneMappings: [
				{ targetId: 'fn-1', tagName: 'Function', sourceAttributes: { uuid: 'src-uuid' } },
			],
			expected: [{ tagName: 'Function', targetId: 'fn-1', templateUuid: 'orig-tpl' }],
		},

		'stamp-template on a single-level element (Function) → templateUuid set, no originUuid': {
			sourceXml: functionDoc('fn-1', {}),
			write: { mode: 'stamp-template' },
			cloneMappings: [
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
				write: { mode: 'stamp-template' },
				cloneMappings: [
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

		"stamp-template when the source has an originUuid → the instance conserves it, the source's templateUuid is not taken":
			{
				sourceXml: allocationRoleDoc('ar-1'),
				write: { mode: 'stamp-template' },
				cloneMappings: [
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
				expected: [
					{
						tagName: 'AllocationRole',
						targetId: 'ar-1',
						templateUuid: 'ar-src-uuid',
						originUuid: 'ar-src-origin',
					},
				],
			},

		'stamp-template replaces the lineage the clone copied from the source': {
			sourceXml: allocationRoleDoc('ar-1', {
				templateUuid: 'ar-src-tpl',
				originUuid: 'ar-src-origin',
			}),
			write: { mode: 'stamp-template' },
			cloneMappings: [
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
			expected: [
				{
					tagName: 'AllocationRole',
					targetId: 'ar-1',
					templateUuid: 'ar-src-uuid',
					originUuid: 'ar-src-origin',
				},
			],
		},

		'stamp-template from a source without lineage → templateUuid only, no originUuid': {
			sourceXml: allocationRoleDoc('ar-1'),
			write: { mode: 'stamp-template' },
			cloneMappings: [
				{ targetId: 'ar-1', tagName: 'AllocationRole', sourceAttributes: { uuid: 'ar-src-uuid' } },
			],
			expected: [{ tagName: 'AllocationRole', targetId: 'ar-1', templateUuid: 'ar-src-uuid' }],
		},

		'stamp-template from a source without uuid → the lineage it copied goes': {
			sourceXml: allocationRoleDoc('ar-1', { templateUuid: 'stale-tpl' }),
			write: { mode: 'stamp-template' },
			cloneMappings: [{ targetId: 'ar-1', tagName: 'AllocationRole', sourceAttributes: {} }],
			expected: [{ tagName: 'AllocationRole', targetId: 'ar-1' }],
		},

		'strip → the element named loses templateUuid and originUuid': {
			sourceXml: allocationRoleDoc('ar-1', { templateUuid: 'tpl', originUuid: 'origin' }),
			write: { mode: 'strip', unlinked: ['src-ar-1'] },
			cloneMappings: [
				{
					targetId: 'ar-1',
					tagName: 'AllocationRole',
					sourceAttributes: { uuid: 'u', templateUuid: 'tpl', originUuid: 'origin' },
				},
			],
			expected: [{ tagName: 'AllocationRole', targetId: 'ar-1' }],
		},

		'strip → an element not named keeps the lineage it was copied with': {
			sourceXml: functionDoc('fn-1', { templateUuid: 'tpl' }),
			write: { mode: 'strip', unlinked: ['another-source'] },
			cloneMappings: [
				{
					targetId: 'fn-1',
					tagName: 'Function',
					sourceAttributes: { uuid: 'u', templateUuid: 'tpl' },
				},
			],
			expected: [{ tagName: 'Function', targetId: 'fn-1', templateUuid: 'tpl' }],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const cloneMappings = testCase.cloneMappings.map((mapping) => ({
			source: {
				tagName: mapping.tagName,
				id: mapping.sourceId ?? `src-${mapping.targetId}`,
				attributes: toAttributes(mapping.sourceAttributes),
			},
			target: { tagName: mapping.tagName, id: mapping.targetId },
		})) as unknown as Scl.CloneMapping[]

		await source.transaction(async (tx) => {
			const { write } = testCase
			if (write.mode === 'strip') {
				await writeIdentity(tx, { cloneMappings, mode: 'strip', unlinked: new Set(write.unlinked) })
			} else {
				await writeIdentity(tx, { cloneMappings, mode: write.mode })
			}
		})

		for (const expected of testCase.expected) {
			const ref = {
				tagName: expected.tagName,
				id: expected.targetId,
			} as unknown as Scl.Ref<Scl.ElementsOf>
			const attributes = (await source.query.any.getAttributes(ref)) as Record<
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
		<SCL ${ns} ${id}="root">
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

function allocationRoleDoc(
	allocationRoleId: string,
	lineage: { templateUuid?: string; originUuid?: string } = {},
): string {
	const templateUuid = lineage.templateUuid ? `templateUuid="${lineage.templateUuid}"` : ''
	const originUuid = lineage.originUuid ? `originUuid="${lineage.originUuid}"` : ''
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="sub" name="S1">
				<Private ${id}="sub-priv" type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole ${id}="${allocationRoleId}" name="R1" uuid="fresh-uuid" ${templateUuid} ${originUuid}/>
				</Private>
			</Substation>
		</SCL>
	`
}

describe('IdentityMode', () => {
	it('names the three modes a write takes: a copy is no mode of writeIdentity', () => {
		expectTypeOf<IdentityMode>().toEqualTypeOf<'strip' | 'stamp-template' | 'keep'>()
	})
})
