import isdInstanceOfBcu1 from '../../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import isdTemplate from '../../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectNorth from '../../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const ns = ALL_XMLNS_NAMESPACES

/** A project holding North / E1 / Q01 and its function BayControl of the instance ISD by their uuids, and no IED. */
const projectHoldingBayControl = /* xml */ `
	<SCL ${ns}>
		<Header id="North" fileType="SSD" uuid="f0000000-0000-4000-8000-000000000020" version="4" revision="A"/>
		<Substation name="North" uuid="b0000000-0000-4000-8000-000000000001">
			<VoltageLevel name="E1" uuid="b0000000-0000-4000-8000-000000000002">
				<Bay name="Q01" uuid="b0000000-0000-4000-8000-000000000003">
					<Function name="BayControl" templateUuid="a0000000-0000-4000-8000-000000000004" uuid="b0000000-0000-4000-8000-000000000004"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project whose IED X holds a logical device carrying the uuid of the instance ISD's function BayControl. */
const projectWhoseDeviceHoldsBayControlUuid = /* xml */ `
	<SCL ${ns}>
		<Header id="East" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000090" version="1" revision="A"/>
		<IED name="X" manufacturer="Supplier" uuid="e0000000-0000-4000-8000-000000000030">
			<AccessPoint name="S1" uuid="e0000000-0000-4000-8000-000000000031">
				<Server>
					<Authentication/>
					<LDevice inst="LD0" uuid="b0000000-0000-4000-8000-000000000004"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** A project whose bay B1 carries the uuid of the instance ISD's subnetwork StationBus. */
const projectWhoseBayHoldsSubNetworkUuid = /* xml */ `
	<SCL ${ns}>
		<Header id="East" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000090" version="1" revision="A"/>
		<Substation name="S1" uuid="e0000000-0000-4000-8000-000000000001">
			<VoltageLevel name="V1" uuid="e0000000-0000-4000-8000-000000000002">
				<Bay name="B1" uuid="b0000000-0000-4000-8000-000000000006"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	scenario: LifecycleScenario
	expected: { key: string | undefined; meta: unknown; staged: number }
}

// What is not placed yet is refused by the placement itself, before anything is written: the IED of an ISD instance
// file placed as a new instance, an IED `template` finds in the project (project North holds BCU1, placed from the
// template), and an ISD instance whose IED or specification the project already holds by uuid (that is an update).
describe('tx.lifecycle.instantiate.ied - a placement not offered', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the IED BCU1 of an ISD instance file → refused, nothing staged': {
			sourceXml: isdInstanceOfBcu1,
			targetXml: projectNorth,
			sourceFileName: 'BCU1.isd',
			scenario: 'instantiate',
			expected: {
				key: 'OPTION_NOT_AVAILABLE',
				meta: { option: 'source', value: 'isd-instance' },
				staged: 0,
			},
		},
		'the IED BCU1 of an ISD instance file as a fork, project North holding BCU1 → refused, nothing staged':
			{
				// North holds BCU1 by the instance's own uuid (...030)
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectNorth,
				sourceFileName: 'BCU1.isd',
				scenario: 'fork',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'scenario', value: 'fork' },
					staged: 0,
				},
			},
		'the IED BCU1 of an ISD instance file as a fork, the project holding North / E1 / Q01 and its function BayControl but no BCU1 → refused, nothing staged':
			{
				// the instance's North / E1 / Q01 and BayControl uuids are the project's; no BCU1 there
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectHoldingBayControl,
				sourceFileName: 'BCU1.isd',
				scenario: 'fork',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: {
						option: 'scenario',
						value: 'fork',
						held: { tagName: 'Substation', path: 'North' },
					},
					staged: 0,
				},
			},
		'the IED BCU1 of an ISD instance file as a fork, a logical device of the project holding the uuid of its function BayControl → refused, nothing staged':
			{
				// the project's logical device LD0 carries BayControl's uuid (...004)
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWhoseDeviceHoldsBayControlUuid,
				sourceFileName: 'BCU1.isd',
				scenario: 'fork',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'scenario', value: 'fork', held: { tagName: 'LDevice', path: 'X/LD0' } },
					staged: 0,
				},
			},
		'the IED BCU1 of an ISD instance file as a fork, a bay of the project holding the uuid of its subnetwork → refused, nothing staged':
			{
				// the project's bay B1 carries the uuid of the instance's StationBus (...006)
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWhoseBayHoldsSubNetworkUuid,
				sourceFileName: 'BCU1.isd',
				scenario: 'fork',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'scenario', value: 'fork', held: { tagName: 'Bay', path: 'S1/V1/B1' } },
					staged: 0,
				},
			},
		'the template ISD as a template, project North holding BCU1 placed from it → refused, nothing staged':
			{
				sourceXml: isdTemplate,
				targetXml: projectNorth,
				sourceFileName: 'BCU_Template.isd',
				scenario: 'template',
				expected: {
					key: 'OPTION_NOT_AVAILABLE',
					meta: { option: 'scenario', value: 'template' },
					staged: 0,
				},
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFileName, { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const [ied] = await sourceQuery.getRecordsByTagName('IED')
		if (!ied) throw new Error('the source holds no IED')
		const root = await target.query.getRoot()
		const outcome = await target.transaction(async function placeRefused(tx) {
			const refusal = await tx.lifecycle.instantiate
				.ied({
					sourceQuery,
					iedRef: { tagName: 'IED', id: ied.id },
					anchor: { tagName: 'SCL', id: root.id },
					fileType: 'ISD',
					scenario: testCase.scenario,
				})
				.then(
					() => undefined,
					(error: unknown) => toDialecteError(error),
				)
			return { refusal, staged: tx.getStagedOperations().length }
		})
		expect({
			key: outcome.refusal?.key,
			meta: outcome.refusal?.meta,
			staged: outcome.staged,
		}).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A project holding two voltage levels, E1 and E2, where the template ISD's one could land. */
const projectWithTwoVoltageLevels = /* xml */ `
	<SCL ${ns}>
		<Header id="Two" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000060" version="1" revision="A"/>
		<Substation name="South" uuid="e0000000-0000-4000-8000-000000000001">
			<VoltageLevel name="E1" uuid="e0000000-0000-4000-8000-000000000002"/>
			<VoltageLevel name="E2" uuid="e0000000-0000-4000-8000-000000000003"/>
		</Substation>
	</SCL>
`

type UndecidedCase = SclTest.BaseXmlTestCase & {
	expected: { key: string | undefined; meta: unknown }
}

// Where a level of the specification lands is the consumer's to decide when the project holds several of its kind:
// placing the IED without that decision is refused, naming the placement of the IED as the operation refusing.
describe('tx.lifecycle.instantiate.ied - a specification level the project holds two of, no decision', () => {
	const testCases: SclTest.TestCases<UndecidedCase> = {
		'the template ISD and a project with E1 and E2 → refused, MAPPING_UNDECIDED from instantiate (ied)':
			{
				sourceXml: isdTemplate,
				targetXml: projectWithTwoVoltageLevels,
				expected: {
					key: 'MAPPING_UNDECIDED',
					meta: {
						sourceId: expect.any(String),
						tagName: 'VoltageLevel',
						kind: 'level',
						operation: 'instantiate (ied)',
					},
				},
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UndecidedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const [ied] = await sourceQuery.getRecordsByTagName('IED')
		if (!ied) throw new Error('the source holds no IED')
		const root = await target.query.getRoot()
		const refusal = await target
			.transaction(async function placeUndecided(tx) {
				await tx.lifecycle.instantiate.ied({
					sourceQuery,
					iedRef: { tagName: 'IED', id: ied.id },
					anchor: { tagName: 'SCL', id: root.id },
					fileType: 'ISD',
				})
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error),
			)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
