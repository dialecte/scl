import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'
import projectNorthBoundInput from '../integration/ied/fixtures/project-north-with-bcu1-whose-interlocking-input-is-bound.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type OwnedCase = SclTest.BaseXmlTestCase & {
	/** The values the consumer takes the template's for. */
	takeOver?: TakeOvers
}

// What the project owns in an S-IED is kept against a newer revision of its template: the source an input of the IED is
// bound to by the system configuration; a value it may set, unless the consumer takes the template's over.
describe('tx.lifecycle.apply - what the project owns in an S-IED updated from its template', () => {
	const testCases: SclTest.TestCases<OwnedCase> = {
		'BCU1 whose interlocking input is bound to CSWI1.Pos.stVal, the template giving it unbound → the binding kept, the template input data kept':
			{
				// the CILO input b…036: bound to BCU1/CTRL/CSWI1.Pos.stVal through PositionGoose; the template's is unbound
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthBoundInput,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:ExtRef[@uuid="b0000000-0000-4000-8000-000000000036"][@iedName="BCU1"][@ldInst="CTRL"][@lnClass="CSWI"][@lnInst="1"][@doName="Pos"][@daName="stVal"][@serviceType="GOOSE"][@srcCBName="PositionGoose"][@lnUuid="b0000000-0000-4000-8000-000000000021"][@intAddr="BusbarDisconnectorPos"][@pDO="Pos"]',
				],
			},
		'BCU1 setting PTOC1.OpDlTmms.setVal to 100, the template giving 150, every value taken over → 150 written':
			{
				// the revision's PTOC setVal is 150; the project's 100 is a value it may set
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				takeOver: 'all',
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTOC"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[.="150"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<OwnedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const resolution = { takeOver: testCase.takeOver }
		const report = await target.query.lifecycle.report({ ...lifecycle, resolution })
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { ...resolution, decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The update of BCU1 from a revision of its template ISD. */
async function updateOfBcu1(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	target: { query: Core.Query<Config> }
	sourceXml: string
}) {
	const { project, target, sourceXml } = params
	const imported = await project.importFile(
		new File([sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	const sourceQuery = project.openDocument(imported.documentId).query
	return {
		verb: 'ied',
		sourceQuery,
		ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
		anchor: await projectRoot(target.query),
		scenario: 'template',
		targetInstance: await iedNamed({ query: target.query, name: 'BCU1' }),
	} as const
}

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
