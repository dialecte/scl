import { writeIdentity } from './write-identity'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

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

/** The write of the case; `preserve` reads the case's document as the source, `strip` names source ids. */
type CaseWrite =
	| { mode: 'stamp-template' | 'keep' | 'preserve' }
	| { mode: 'strip'; unlinked: string[] }

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

		'preserve → lineage carried verbatim (neither stamped nor stripped)': {
			sourceXml: functionDoc('fn-1', { templateUuid: 'carried-tpl' }),
			write: { mode: 'preserve' },
			cloneMappings: [
				{
					targetId: 'fn-1',
					tagName: 'Function',
					sourceId: 'fn-1',
					sourceAttributes: { uuid: 'fn-src-uuid', templateUuid: 'carried-tpl' },
				},
			],
			expected: [{ tagName: 'Function', targetId: 'fn-1', templateUuid: 'carried-tpl' }],
		},

		'preserve on a two-level element → templateUuid AND originUuid carried verbatim (no shift)': {
			sourceXml: allocationRoleDoc('ar-1', {
				templateUuid: 'carried-tpl',
				originUuid: 'carried-origin',
			}),
			write: { mode: 'preserve' },
			cloneMappings: [
				{
					targetId: 'ar-1',
					tagName: 'AllocationRole',
					sourceId: 'ar-1',
					sourceAttributes: {
						uuid: 'ar-src-uuid',
						templateUuid: 'carried-tpl',
						originUuid: 'carried-origin',
					},
				},
			],
			expected: [
				{
					tagName: 'AllocationRole',
					targetId: 'ar-1',
					templateUuid: 'carried-tpl',
					originUuid: 'carried-origin',
				},
			],
		},

		'preserve: an element copied into a function of the same template keeps its lineage': {
			sourceXml: copyDoc(),
			write: { mode: 'preserve' },
			cloneMappings: [copied({ from: 'source-lnode', to: 'into-same-template', tagName: 'LNode' })],
			expected: [
				{ tagName: 'LNode', targetId: 'into-same-template', templateUuid: 'lnode-template' },
			],
		},

		'preserve: an element copied into a function of another template loses its lineage': {
			sourceXml: copyDoc(),
			write: { mode: 'preserve' },
			cloneMappings: [
				copied({ from: 'source-lnode', to: 'into-other-template', tagName: 'LNode' }),
			],
			expected: [{ tagName: 'LNode', targetId: 'into-other-template' }],
		},

		'preserve: a subfunction copied into another template loses its lineage, and so does what it holds':
			{
				sourceXml: copyDoc(),
				write: { mode: 'preserve' },
				cloneMappings: [
					copied({ from: 'source-subfunction', to: 'copied-subfunction', tagName: 'SubFunction' }),
					copied({ from: 'source-sub-lnode', to: 'copied-sub-lnode', tagName: 'LNode' }),
				],
				expected: [
					{ tagName: 'SubFunction', targetId: 'copied-subfunction' },
					{ tagName: 'LNode', targetId: 'copied-sub-lnode' },
				],
			},

		'preserve: what a subfunction holds, listed before it, loses its lineage with it': {
			sourceXml: copyDoc(),
			write: { mode: 'preserve' },
			cloneMappings: [
				copied({ from: 'source-sub-lnode', to: 'copied-sub-lnode', tagName: 'LNode' }),
				copied({ from: 'source-subfunction', to: 'copied-subfunction', tagName: 'SubFunction' }),
			],
			expected: [
				{ tagName: 'SubFunction', targetId: 'copied-subfunction' },
				{ tagName: 'LNode', targetId: 'copied-sub-lnode' },
			],
		},
		'preserve: a subfunction copied into a function of the same template keeps its lineage, and so does what it holds':
			{
				sourceXml: copyDoc(),
				write: { mode: 'preserve' },
				cloneMappings: [
					copied({ from: 'source-subfunction', to: 'same-subfunction', tagName: 'SubFunction' }),
					copied({ from: 'source-sub-lnode', to: 'same-sub-lnode', tagName: 'LNode' }),
				],
				expected: [
					{ tagName: 'SubFunction', targetId: 'same-subfunction', templateUuid: 'sub-template' },
					{ tagName: 'LNode', targetId: 'same-sub-lnode', templateUuid: 'sub-lnode-template' },
				],
			},

		'preserve: a function copied from a level of an instance onto another level keeps its lineage (it sits on a level)':
			{
				sourceXml: copyDoc(),
				write: { mode: 'preserve' },
				cloneMappings: [
					copied({ from: 'source-function', to: 'copied-function', tagName: 'Function' }),
				],
				expected: [
					{ tagName: 'Function', targetId: 'copied-function', templateUuid: 'function-template' },
				],
			},

		'preserve: an element of a hand-made function (no lineage) keeps its own wherever it is copied':
			{
				sourceXml: copyDoc(),
				write: { mode: 'preserve' },
				cloneMappings: [copied({ from: 'handmade-lnode', to: 'handmade-copy', tagName: 'LNode' })],
				expected: [
					{ tagName: 'LNode', targetId: 'handmade-copy', templateUuid: 'handmade-lnode-template' },
				],
			},
		'preserve: several roots copied at once, each read from its own source parent': {
			sourceXml: copyDoc(),
			write: { mode: 'preserve' },
			cloneMappings: [
				copied({ from: 'source-lnode', to: 'into-other-template', tagName: 'LNode' }),
				copied({ from: 'source-function', to: 'copied-function', tagName: 'Function' }),
			],
			expected: [
				{ tagName: 'LNode', targetId: 'into-other-template' },
				{ tagName: 'Function', targetId: 'copied-function', templateUuid: 'function-template' },
			],
		},
		'preserve: the parent of an element in a Private is the element holding the Private': {
			sourceXml: copyDoc(),
			write: { mode: 'preserve' },
			cloneMappings: [
				copied({ from: 'source-variable', to: 'copied-variable', tagName: 'Variable' }),
			],
			expected: [{ tagName: 'Variable', targetId: 'copied-variable' }],
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
			} else if (write.mode === 'preserve') {
				await writeIdentity(tx, {
					cloneMappings,
					mode: 'preserve',
					sourceQuery: source.query,
					sourceRoots: cloneMappings.map((mapping) => mapping.source),
				})
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

/** A copy of a record of {@link copyDoc}, read with the lineage it holds there. */
function copied(params: { from: string; to: string; tagName: string }): MappingSpec {
	const { from, to, tagName } = params
	return {
		targetId: to,
		tagName,
		sourceId: from,
		sourceAttributes: COPY_DOC_LINEAGE[from] ?? {},
	}
}

/** The lineage of the source records of {@link copyDoc}. */
const COPY_DOC_LINEAGE: Record<string, MappingSpec['sourceAttributes']> = {
	'source-function': { uuid: 'source-function-uuid', templateUuid: 'function-template' },
	'source-lnode': { uuid: 'source-lnode-uuid', templateUuid: 'lnode-template' },
	'handmade-lnode': { uuid: 'handmade-lnode-uuid', templateUuid: 'handmade-lnode-template' },
	'source-subfunction': { uuid: 'source-subfunction-uuid', templateUuid: 'sub-template' },
	'source-sub-lnode': { uuid: 'source-sub-lnode-uuid', templateUuid: 'sub-lnode-template' },
	'source-variable': {
		uuid: 'source-variable-uuid',
		templateUuid: 'variable-template',
		originUuid: 'variable-origin',
	},
}

/**
 * A function of an instance (bay `B1` of a level template) holding an LNode, a subfunction and a variable, and the
 * copies already placed (lineage as copied): into a function of the same template, into a function of another
 * template, onto a plain bay.
 */
function copyDoc(): string {
	const lnode = (recordId: string, templateUuid: string, uuid: string, inst: string) =>
		/* xml */ `<LNode ${id}="${recordId}" iedName="None" lnClass="CSWI" lnInst="${inst}" uuid="${uuid}" templateUuid="${templateUuid}"/>`
	const variable = (recordId: string, uuid: string) => /* xml */ `
		<Private ${id}="${recordId}-private" type="eIEC61850-6-100">
			<eIEC61850-6-100:Variable ${id}="${recordId}" name="Prefix" value="DV" uuid="${uuid}" templateUuid="variable-template" originUuid="variable-origin"/>
		</Private>
	`
	return /* xml */ `
		<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
			<Substation ${id}="sub" name="S1">
				<VoltageLevel ${id}="vl" name="V1">
					<Bay ${id}="b1" name="B1" uuid="b1-uuid" templateUuid="bay-template">
						<Function ${id}="source-function" name="Source" uuid="source-function-uuid" templateUuid="function-template">
							${variable('source-variable', 'source-variable-uuid')}
							${lnode('source-lnode', 'lnode-template', 'source-lnode-uuid', '1')}
							<SubFunction ${id}="source-subfunction" name="Sub" uuid="source-subfunction-uuid" templateUuid="sub-template">
								${lnode('source-sub-lnode', 'sub-lnode-template', 'source-sub-lnode-uuid', '2')}
							</SubFunction>
						</Function>
						<Function ${id}="handmade-function" name="Handmade" uuid="handmade-function-uuid">
							${lnode('handmade-lnode', 'handmade-lnode-template', 'handmade-lnode-uuid', '1')}
						</Function>
					</Bay>
					<Bay ${id}="b2" name="B2" uuid="b2-uuid">
						<Function ${id}="same-function" name="Same" uuid="same-function-uuid" templateUuid="function-template">
							${lnode('into-same-template', 'lnode-template', 'copy-1', '1')}
							${lnode('handmade-copy', 'handmade-lnode-template', 'copy-9', '3')}
							<SubFunction ${id}="same-subfunction" name="Sub" uuid="copy-2" templateUuid="sub-template">
								${lnode('same-sub-lnode', 'sub-lnode-template', 'copy-3', '2')}
							</SubFunction>
						</Function>
						<Function ${id}="other-function" name="Other" uuid="other-function-uuid" templateUuid="other-template">
							${variable('copied-variable', 'copy-4')}
							${lnode('into-other-template', 'lnode-template', 'copy-5', '1')}
							<SubFunction ${id}="copied-subfunction" name="Sub" uuid="copy-6" templateUuid="sub-template">
								${lnode('copied-sub-lnode', 'sub-lnode-template', 'copy-7', '2')}
							</SubFunction>
						</Function>
						<Function ${id}="copied-function" name="Copied" uuid="copy-8" templateUuid="function-template"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

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

function allocationRoleDoc(
	allocationRoleId: string,
	lineage: { templateUuid?: string; originUuid?: string } = {},
): string {
	const templateUuid = lineage.templateUuid ? `templateUuid="${lineage.templateUuid}"` : ''
	const originUuid = lineage.originUuid ? `originUuid="${lineage.originUuid}"` : ''
	return /* xml */ `
		<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
			<Substation ${id}="sub" name="S1">
				<Private ${id}="sub-priv" type="eIEC61850-6-100">
					<eIEC61850-6-100:AllocationRole ${id}="${allocationRoleId}" name="R1" uuid="fresh-uuid" ${templateUuid} ${originUuid}/>
				</Private>
			</Substation>
		</SCL>
	`
}
