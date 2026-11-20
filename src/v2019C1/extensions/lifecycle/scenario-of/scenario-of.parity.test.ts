import isdBcu1Version1 from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import isdBcu1Version2 from '../integration/ied/fixtures/isd-bcu1-version-2.xml?raw'
import isdInstanceOfBcu1 from '../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthWithSub1 from '../integration/ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The file of BCU1 (its Header uuid) holding an IED BCU1 of another uuid. */
const bcu1FileAnotherIed = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="f0000000-0000-4000-8000-000000000002" version="1" revision="B"/>
		<IED name="BCU1" uuid="b0000000-0000-4000-8000-000000000090">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** Another ISD instance file holding an IED BCU1: another Header uuid, another IED uuid. */
const anotherIsdInstance = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="f0000000-0000-4000-8000-000000000009" version="1" revision="B"/>
		<IED name="BCU1" uuid="b0000000-0000-4000-8000-000000000090">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** The open document (`targetXml`) and the source file (`sourceXml`), each imported under its name. */
type FileNames = { openName: string; sourceName: string }

type PlaceCase = SclTest.BaseXmlTestCase &
	FileNames & {
		/** The scenario the query picks, the one the verb is asked for. */
		scenario: LifecycleScenario
		/** The error both tell: its key, or none when the verb runs. */
		expected: { code: string | undefined }
	}

type UpdateCase = PlaceCase & {
	/** The name of the open document's IED the update starts from. */
	updates: string
	scenario: 'template' | 'fork'
}

/** What the query or a verb tells: the error's key and meta, or the scenario it ran with. */
type Told = { code: string | undefined; meta: unknown } | { scenario: LifecycleScenario }

// The query and the IED verbs read one decision: a scenario the query answers, the verb runs; a refusal the query
// returns, the verb throws, with the same key and meta. A placement is told by the report.
describe('query.lifecycle.scenarioOf.ied - the report refuses a placement the query refuses, alike', () => {
	const testCases: SclTest.TestCases<PlaceCase> = {
		'an ISD instance placed in a project holding its IED -> both OPTION_NOT_AVAILABLE, one meta': {
			// North holds BCU1 under the uuid the ISD instance keeps
			targetXml: projectNorth,
			openName: 'North.ssd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.isd',
			scenario: 'fork',
			expected: { code: 'OPTION_NOT_AVAILABLE' },
		},
		'an IED read from an IID -> both OPTION_NOT_AVAILABLE, one meta': {
			// the ISD instance read under an IID's extension
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.iid',
			scenario: 'instantiate',
			expected: { code: 'OPTION_NOT_AVAILABLE' },
		},
		'a source of an extension no IED is read from -> both OPTION_NOT_AVAILABLE, one meta': {
			// the template ISD read under an FSD's extension
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdTemplateRevised,
			sourceName: 'BCU_Template.fsd',
			scenario: 'instantiate',
			expected: { code: 'OPTION_NOT_AVAILABLE' },
		},
		'an ISD instance placed in a project that lacks it -> fork answered, the report runs': {
			// South holds no uuid of BCU1's file
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.isd',
			scenario: 'fork',
			expected: { code: undefined },
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<PlaceCase>): Promise<void> {
		const { open, source, ref } = await openCaseFiles({ project, testCase })
		const answer = await open.query.lifecycle.scenarioOf.ied({ sourceQuery: source.query, ref })
		const anchor = await projectRoot(open.query)
		const reported = await open.query.lifecycle
			.report({ verb: 'ied', sourceQuery: source.query, ref, anchor, scenario: testCase.scenario })
			.then(
				(): Told => ({ scenario: testCase.scenario }),
				(error: unknown) => toldBy(error),
			)
		expect(toldByQuery(answer)).toEqual(reported)
		expect(codeOf(reported)).toBe(testCase.expected.code)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An update is told alike by the report and by `update.ied`, which `apply` runs.
describe('query.lifecycle.scenarioOf.ied - the report and update.ied refuse an update the query refuses, alike', () => {
	const testCases: SclTest.TestCases<UpdateCase> = {
		'the open ISD updated from another ISD instance -> all NOT_A_VERSION_OF_FILE, one meta': {
			// another Header uuid, another IED uuid
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: anotherIsdInstance,
			sourceName: 'BCU1-other.isd',
			updates: 'BCU1',
			scenario: 'fork',
			expected: { code: 'NOT_A_VERSION_OF_FILE' },
		},
		'the open ISD updated from its file holding another IED -> all NOT_A_VERSION_OF_FILE, one meta':
			{
				// BCU1's Header uuid, another IED uuid
				targetXml: isdBcu1Version1,
				openName: 'BCU1.isd',
				sourceXml: bcu1FileAnotherIed,
				sourceName: 'BCU1-other.isd',
				updates: 'BCU1',
				scenario: 'fork',
				expected: { code: 'NOT_A_VERSION_OF_FILE' },
			},
		'an S-IED updated from an ISD instance -> all OPTION_NOT_AVAILABLE, one meta': {
			// North's BCU1 was placed from the template; the source is an instance, no template
			targetXml: projectNorth,
			openName: 'North.ssd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.isd',
			updates: 'BCU1',
			scenario: 'template',
			expected: { code: 'OPTION_NOT_AVAILABLE' },
		},
		'an IED the template placed none of updated from it -> all TARGET_INSTANCE_REQUIRED, one meta':
			{
				// South's R1 carries no lineage of the template
				targetXml: projectSouth,
				openName: 'South.scd',
				sourceXml: isdTemplateRevised,
				sourceName: 'BCU_Template.isd',
				updates: 'R1',
				scenario: 'template',
				expected: { code: 'TARGET_INSTANCE_REQUIRED' },
			},
		'an IED of a project holding an instance updated from the template -> all TARGET_INSTANCE_REQUIRED, one meta':
			{
				// North holds BCU1 placed from the template; SUB1 is no instance of it
				targetXml: projectNorthWithSub1,
				openName: 'North.ssd',
				sourceXml: isdTemplateRevised,
				sourceName: 'BCU_Template.isd',
				updates: 'SUB1',
				scenario: 'template',
				expected: { code: 'TARGET_INSTANCE_REQUIRED' },
			},
		'the open ISD updated from another version of its file -> fork answered, both verbs run': {
			// BCU1's Header uuid and IED uuid, revision 2
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: isdBcu1Version2,
			sourceName: 'BCU1-v2.isd',
			updates: 'BCU1',
			scenario: 'fork',
			expected: { code: undefined },
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<UpdateCase>): Promise<void> {
		const { open, source, ref } = await openCaseFiles({ project, testCase })
		const targetInstance = await iedNamed({ query: open.query, name: testCase.updates })
		const { scenario } = testCase
		const answer = await open.query.lifecycle.scenarioOf.ied({
			sourceQuery: source.query,
			ref,
			targetInstance,
		})
		const anchor = await projectRoot(open.query)
		const reported = await open.query.lifecycle
			.report({ verb: 'ied', sourceQuery: source.query, ref, anchor, scenario, targetInstance })
			.then(
				(): Told => ({ scenario }),
				(error: unknown) => toldBy(error),
			)
		const updated = await open
			.prepare(async function updateTheIed(tx) {
				await tx.lifecycle.update.ied({
					sourceQuery: source.query,
					iedRef: ref,
					anchor,
					fileType: 'ISD',
					scenario,
					targetInstance,
				})
			})
			.then(
				(): Told => ({ scenario }),
				(error: unknown) => toldBy(error),
			)
		expect({ reported, updated }).toEqual({
			reported: toldByQuery(answer),
			updated: toldByQuery(answer),
		})
		expect(codeOf(reported)).toBe(testCase.expected.code)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** What the query tells: its refusal's code and meta, or its scenario. */
function toldByQuery(
	answer: Awaited<ReturnType<Scl.Query['lifecycle']['scenarioOf']['ied']>>,
): Told {
	return 'refused' in answer
		? { code: answer.refused.code, meta: answer.refused.meta }
		: { scenario: answer.scenario }
}

/** What a verb's error tells: its key and meta. */
function toldBy(error: unknown): Told {
	const refusal = toDialecteError(error)
	return { code: refusal?.key, meta: refusal?.meta }
}

/** The error's key a verb or the query told, none when it ran. */
function codeOf(told: Told): string | undefined {
	return 'code' in told ? told.code : undefined
}

/** Import the open document and the source file of the case, each under its name, and read the source's IED. */
async function openCaseFiles(params: {
	project: SclTest.ActParams<PlaceCase>['project']
	testCase: SclTest.BaseXmlTestCase & FileNames
}) {
	const { project, testCase } = params
	const open = await openFile({ project, xml: testCase.targetXml, fileName: testCase.openName })
	const source = await openFile({ project, xml: testCase.sourceXml, fileName: testCase.sourceName })
	const ref = await iedNamed({ query: source.query })
	return { open, source, ref }
}

/** The root of a document, as an IED operation's anchor. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}

/** Import a file into the project under its name, and open it. */
async function openFile(params: {
	project: SclTest.ActParams<PlaceCase>['project']
	xml: string | undefined
	fileName: string
}) {
	const { project, xml, fileName } = params
	if (!xml) throw new Error(`${fileName}: xml required`)
	const { documentId } = await project.importFile(new File([xml], fileName, { type: 'text/xml' }), {
		useCustomRecordsIds: true,
	})
	return project.openDocument(documentId)
}

/** The IED of a document named so; its only IED when no name is given. */
async function iedNamed(params: {
	query: Core.Query<Config>
	name?: string
}): Promise<Scl.Ref<'IED'>> {
	const { query, name } = params
	const ieds = name
		? await query.findByAttributes({ tagName: 'IED', attributes: { name } })
		: await query.getRecordsByTagName('IED')
	const [ied] = ieds
	if (!ied) throw new Error(`no IED ${name ?? ''}`)
	return { tagName: 'IED', id: ied.id }
}
