import { findByUuid, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { reference } from '@/v2019C1/extensions/reference'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// An application instance stands on the functions it composes: the ones it refers to, and a function of the project it
// takes where it stands. The changes of such a function count for the application's provenance whether the reference
// the newer revision gives the application to it is accepted or declined: the application holds the revision it
// follows when anything the revision brings to what it stands on is accepted.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The changes of the update the consumer declines: every one, or the reference the application gains. */
	declined: 'every change' | 'the new reference'
	/** The source-file references of the project after the update, `<anchor kind> <file> <version>/<revision>`, sorted. */
	expectedProvenance: string[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`
const projectBay = { tagName: 'Bay', id: 'project-bay' } as Scl.Ref<'Bay'>

/** An ASD in its first revision (version 1, revision A); its function records the FSD it was placed from. */
const asdXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="application-file" uuid="application-file-uuid" version="1" revision="A" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<Private type="eIEC61850-6-100" ${id}="source-substation-private">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="source-application">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="source-function-role">
						<eIEC61850-6-100:FunctionRoleContent ${id}="source-function-role-content">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="source-function-ref"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="TEMPLATE" ${id}="source-bay">
					<Function name="Prot" uuid="function-uuid" templateUuid="library-function" ${id}="source-function">
						<Private type="eIEC61850-6-100" ${id}="source-function-private">
							<eIEC61850-6-100:FunctionSclRef ${id}="source-function-sclref">
								<eIEC61850-6-100:SclFileReference fileName="prot-library" fileType="FSD" fileUuid="prot-library-uuid" version="3" revision="1" ${id}="source-function-file"/>
							</eIEC61850-6-100:FunctionSclRef>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A function of the gained lineage in the bay of the project, that no application instance refers to. */
async function holdFreeControl(tx: Scl.Transaction): Promise<void> {
	await tx.addChild(projectBay, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'free-control-uuid', templateUuid: 'control-uuid' },
	})
}

/** The newer ASD revision: its Header version 2 revision B, the application gaining the described function `Ctrl`. */
async function gainDescribedControl(tx: Scl.Transaction): Promise<void> {
	await tx.update({ tagName: 'Header', id: 'source-header' } as Scl.Ref<'Header'>, {
		attributes: { version: '2', revision: 'B' },
	})
	await tx.addChild({ tagName: 'Bay', id: 'source-bay' } as Scl.Ref<'Bay'>, {
		tagName: 'Function',
		attributes: { name: 'Ctrl', uuid: 'control-uuid', desc: 'rev2' },
	})
	await tx.addChild(
		{
			tagName: 'FunctionRoleContent',
			id: 'source-function-role-content',
		} as Scl.Ref<'FunctionRoleContent'>,
		{
			tagName: 'FunctionRef',
			attributes: { function: 'TEMPLATE/TEMPLATE/TEMPLATE/Ctrl', functionUuid: 'control-uuid' },
		},
	)
}

/** Every group of a report declined. */
function declineAll(report: DiffReport): DecisionMap {
	return new Map(allGroups(report).map((group) => [group.id, 'skip' as const]))
}

/** The group adding a reference declined, every other group accepted. */
function declineNewReference(report: DiffReport): DecisionMap {
	return new Map(
		allGroups(report).map((group) => [
			group.id,
			group.change === 'added' && group.primary.tagName === 'FunctionRef'
				? ('skip' as const)
				: ('accept' as const),
		]),
	)
}

const DECLINE: Record<TestCase['declined'], (report: DiffReport) => DecisionMap> = {
	'every change': declineAll,
	'the new reference': declineNewReference,
}

/**
 * The ASD placed in the bay, which then holds a free function of the lineage its template will gain, and the
 * template's newer revision applied with these decisions.
 */
async function placeThenUpdate(params: {
	source: Scl.Document
	target: Scl.Document
	decide: (report: DiffReport) => DecisionMap
}): Promise<void> {
	const { source, target, decide } = params
	const application = await findByUuid(source.query, {
		tagName: 'Application',
		uuid: 'application-uuid',
	})
	const lifecycle = { verb: 'asd' as const, sourceQuery: source.query, ref: application }
	await reportAndApply({
		document: target,
		lifecycle: { ...lifecycle, anchor: projectBay, scenario: 'instantiate' },
	})
	await target.transaction(holdFreeControl)
	await source.transaction(gainDescribedControl)
	await reportAndApply({
		document: target,
		lifecycle: { ...lifecycle, anchor: projectBay, scenario: 'template' },
		decide,
	})
}

describe('provenance follows an update: a function the application takes where it stands counts for it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the reference to the function declined, its own change accepted → the application records the newer revision':
			{
				sourceXml: asdXml,
				targetXml: projectXml,
				declined: 'the new reference',
				expectedProvenance: ['application source.xml 2/B', 'function prot-library 3/1'],
			},
		'every change declined → the application still records the revision it holds': {
			sourceXml: asdXml,
			targetXml: projectXml,
			declined: 'every change',
			expectedProvenance: ['application source.xml 1/A', 'function prot-library 3/1'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await placeThenUpdate({ source, target, decide: DECLINE[testCase.declined] })

		const entries = await reference.query.getProvenance(target.query)
		const listed = entries.map(
			(entry) => `${entry.anchor.kind} ${entry.fileName ?? ''} ${entry.version}/${entry.revision}`,
		)
		expect(listed.sort()).toEqual(testCase.expectedProvenance)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type TakenTestCase = SclTest.BaseXmlTestCase & { targetXml: string }

describe('a function the application takes where it stands is written when its own change is accepted', () => {
	const testCases: SclTest.TestCases<TakenTestCase> = {
		'the reference to the function declined, nothing of the application itself written → the change of the function is written':
			{ sourceXml: asdXml, targetXml: projectXml },
	}

	async function act({ source, target }: SclTest.ActParams<TakenTestCase>) {
		if (!target) throw new Error('target required')
		await placeThenUpdate({ source, target, decide: declineNewReference })

		const [control] = await target.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { name: 'Ctrl' },
		})
		const attributes = await target.query.any.getAttributes(control)
		expect(attributes.desc).toBe('rev2')
		return { assertOn: 'target' as const }
	}

	runSclTestCases.withExport({ testCases, act })
})
