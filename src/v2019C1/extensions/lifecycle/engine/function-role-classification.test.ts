import { diff } from './diff'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A `FunctionRole` carries its own lineage (`uuid` / `templateUuid` / `originUuid`): one an instance holds
// with NO lineage of the template (a `uuid`, no `templateUuid`) is the project's own, whoever created it —
// listed as `target-only` (kept by default). A consumer that creates such roles itself (a grouping it
// maintains) names the tags in `consumerManagedTags`: the engine then lists nothing for them.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-src">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:Application name="App" uuid="app-src" ${id}="app-s">
							<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="fr-src" ${id}="fr-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s"/>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The instance matches the template `Application` (templateUuid) and its `FunctionRole`, PLUS carries an
// extra `FunctionRole name="Measurement"` with a uuid of its own and no templateUuid: the project's own
// role, unless a consumer names `FunctionRole` among its `consumerManagedTags`.
const targetXml = /* xml */ `
	<SCL ${ns} ${id}="asd-tgt">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:Application name="App" uuid="app-i" templateUuid="app-src" ${id}="app-i">
							<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="fr-i" templateUuid="fr-src" ${id}="fr-i">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-i"/>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:FunctionRole name="Measurement" uuid="fr-extra" ${id}="fr-extra"/>
						</eIEC61850-6-100:Application>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The element tags the consumer names as its own (the diff policy); absent = no option. */
	consumerManagedTags?: readonly string[]
	/** The groups the diff lists, `<change> <tag>`. */
	groups: string[]
}

describe("engine.diff — a FunctionRole an instance holds without lineage is the project's own unless the consumer names it", () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no option → a lineage-less instance FunctionRole is listed as target-only': {
			sourceXml,
			targetXml,
			groups: ['target-only FunctionRole'],
		},
		'consumerManagedTags names FunctionRole and FunctionRoleContent → it is not listed, nothing changed':
			{
				sourceXml,
				targetXml,
				consumerManagedTags: ['FunctionRole', 'FunctionRoleContent'],
				groups: [],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>,
			instanceRootRef: { tagName: 'Application', id: 'app-i' } as Scl.Ref<'Application'>,
			diffPolicy: testCase.consumerManagedTags && {
				boundLogicalNodeTypes: 'follow',
				consumerManagedTags: new Set(testCase.consumerManagedTags),
			},
		})

		expect(report.groups.map((group) => `${group.change} ${group.primary.tagName}`)).toEqual(
			testCase.groups,
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
