import isdTemplateRevised from '../../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorth from '../../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type RefusalCase = SclTest.BaseXmlTestCase & {
	/** The refusal: its key and the number of instances it names. */
	expected: { key: string; instances: number }
}

type ReleaseCase = SclTest.BaseXmlTestCase & {
	/** What the removal of the logical node does outside it: `<tag> <uuid> <effect>`, sorted. */
	sideEffects: string[]
}

// A logical node an update removes releases the LNodes bound to it: the report warns of each on the removal's group.
describe('query.lifecycle.report - the LNodes an S-IED update releases', () => {
	const testCases: SclTest.TestCases<ReleaseCase> = {
		'the revision dropping PTRC of BCU1, the LNode of LineProtection bound to it → that LNode listed released on the PTRC removal':
			{
				// the LNode b…014 of LineProtection is bound to BCU1's PTRC (b…024), which the revision replaces by RREC
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				sideEffects: ['LNode b0000000-0000-4000-8000-000000000014 cleared'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<ReleaseCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const ref = await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' })
		const anchor = await projectRoot(target.query)
		const targetInstance = await iedNamed({ query: target.query, name: 'BCU1' })
		const report = await target.query.lifecycle.report({
			verb: 'ied',
			sourceQuery,
			ref,
			anchor,
			targetInstance,
		})
		const removal = report.instances
			.flatMap((instance) => instance.groups)
			.find((group) => group.primary.tagName === 'LN' && group.change === 'removed')
		const sideEffects = removal?.sideEffects ?? []
		const uuids = await uuidsOf({
			query: target.query,
			elements: sideEffects.map((entry) => entry.element),
		})
		const listed = sideEffects.map(
			(entry, position) => `${entry.element.tagName} ${uuids[position]} ${entry.effect}`,
		)
		expect(listed.sort()).toEqual(testCase.sideEffects)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An update starts from an IED placed from the file's template: an IED of the project the file's template placed none
// of is refused, naming it, instead of reporting a first placement.
describe('query.lifecycle.report - an S-IED update started from an IED the template did not place', () => {
	const testCases: SclTest.TestCases<RefusalCase> = {
		'the project holding R1 only, placed from no template, R1 named → refused with TARGET_INSTANCE_REQUIRED, naming R1':
			{
				// R1 (e…001) carries no templateUuid; the revision's IED is SPECIFICATION
				sourceXml: isdTemplateRevised,
				targetXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="P" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000070" version="1" revision="A"/>
						<IED name="R1" manufacturer="M" uuid="e0000000-0000-4000-8000-000000000001">
							<AccessPoint name="S1" uuid="e0000000-0000-4000-8000-000000000002"/>
						</IED>
					</SCL>
				`,
				expected: { key: 'TARGET_INSTANCE_REQUIRED', instances: 0 },
				expectedQueries: ['/default:SCL[count(default:IED)=1]/default:IED[@name="R1"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<RefusalCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const named = await iedNamed({ query: target.query, name: 'R1' })
		const ref = await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' })
		const anchor = await projectRoot(target.query)
		const outcome = await target.query.lifecycle
			.report({ verb: 'ied', sourceQuery, ref, anchor, targetInstance: named })
			.then(
				() => ({ key: undefined, instances: undefined, named: undefined }),
				function refusalOf(error: unknown) {
					const refusal = toDialecteError(error)
					const meta = (refusal?.meta ?? {}) as { instances?: unknown[]; named?: { id?: string } }
					return { key: refusal?.key, instances: meta.instances?.length, named: meta.named?.id }
				},
			)
		expect(outcome).toEqual({ ...testCase.expected, named: named.id })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The IED of a document named so. */
async function iedNamed(params: {
	query: Core.Query<Config>
	name: string
}): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.query.findByAttributes({
		tagName: 'IED',
		attributes: { name: params.name },
	})
	if (!ied) throw new Error(`no IED ${params.name}`)
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}

/** The uuid of each element, in order: empty for one the document no longer holds. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly { tagName: string; id: string }[]
}): Promise<string[]> {
	const records = await params.query.any.getRecords([...params.elements])
	return records.map((record) =>
		record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : '',
	)
}
