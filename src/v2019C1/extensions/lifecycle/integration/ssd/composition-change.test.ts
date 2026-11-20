import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The next revision of the bay template. */
	nextXml: string
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** The bay template, revision 1: `Display` composes `Ctrl`, `Prot` and `Ctrl` both in the bay. */
const displayComposingCtrl = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
						<eIEC61850-6-100:Application name="Display" type="DCS" uuid="display-uuid" ${id}="source-display">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="display-role-uuid" ${id}="source-display-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-display-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Ctrl" functionUuid="ctrl-uuid" ${id}="source-display-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="prot-uuid" ${id}="source-prot"/>
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Revision 2: `Display` composes `Prot` instead, `Ctrl` still in the bay. */
const displayComposingProt = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="2" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
						<eIEC61850-6-100:Application name="Display" type="DCS" uuid="display-uuid" ${id}="source-display">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="display-role-uuid" ${id}="source-display-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="source-display-content">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Prot" functionUuid="prot-uuid" ${id}="source-display-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="prot-uuid" ${id}="source-prot"/>
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The newer bay template's Display composes Prot instead of Ctrl, Ctrl still standalone in the bay: the update
// reconciles Ctrl as a standalone function, never as Display's leftover.
describe('ssd update: an application composing another function of the unit', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'Display composing Prot instead of Ctrl, Ctrl still in the bay → Ctrl kept, Display composing Prot':
			{
				sourceXml: displayComposingCtrl,
				targetXml: projectXml,
				nextXml: displayComposingProt,
				expectedGroups: ['added FunctionRef', 'removed FunctionRef'],
				expectedQueries: [
					'//default:Function[@templateUuid="ctrl-uuid"]',
					'//v2019C1:Application[@templateUuid="display-uuid"]//v2019C1:FunctionRef[@function="S1/V1/Feeder/Prot"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionRef[@function="S1/V1/Feeder/Ctrl"]'],
			},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<TestCase>) {
		if (!target) throw new Error('target required')
		await reportAndApply({
			document: target,
			lifecycle: lifecycleOf({ query: source.query, scenario: 'instantiate' }),
		})
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycleOf({ query: next.query, scenario: 'template' }),
		})
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		return { assertOn: 'target' as const }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The bay template placed in, then updated in, the project's voltage level. */
function lifecycleOf(params: {
	query: SclTest.ActParams<TestCase>['source']['query']
	scenario: 'instantiate' | 'template'
}): LifecycleTarget {
	return {
		verb: 'ssd',
		sourceQuery: params.query,
		ref: { tagName: 'Bay', id: 'source-feeder' },
		anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		scenario: params.scenario,
	} as LifecycleTarget
}
