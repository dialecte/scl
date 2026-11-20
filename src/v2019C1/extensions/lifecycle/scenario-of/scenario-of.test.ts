import isdBcu1Version1 from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import isdBcu1Version2 from '../integration/ied/fixtures/isd-bcu1-version-2.xml?raw'
import isdInstanceOfBcu1 from '../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplate from '../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const BCU1_FILE_UUID = 'f0000000-0000-4000-8000-000000000002'
const OTHER_FILE_UUID = 'f0000000-0000-4000-8000-000000000009'
const BCU1_IED_UUID = 'b0000000-0000-4000-8000-000000000030'
const OTHER_IED_UUID = 'b0000000-0000-4000-8000-000000000090'

/** Another ISD instance file holding an IED BCU1: another Header uuid, another IED uuid. */
const anotherIsdInstance = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${OTHER_FILE_UUID}" version="1" revision="B"/>
		<IED name="BCU1" uuid="${OTHER_IED_UUID}">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** The file of BCU1 (its Header uuid) holding an IED BCU1 of another uuid. */
const bcu1FileAnotherIed = /* xml */ `
	<SCL ${ns} ${id}="other-root">
		<Header id="isd_bcu1" fileType="ISD" uuid="${BCU1_FILE_UUID}" version="1" revision="B"/>
		<IED name="BCU1" uuid="${OTHER_IED_UUID}">
			<AccessPoint name="AP1" uuid="b0000000-0000-4000-8000-000000000091"/>
		</IED>
	</SCL>
`

/** A template file whose Header names a file. */
const templateFile = /* xml */ `
	<SCL ${ns} ${id}="template-root">
		<Header id="template" uuid="${OTHER_FILE_UUID}" version="1" revision="A"/>
	</SCL>
`

/** Another revision of that template file: the same Header uuid. */
const templateFileRevised = /* xml */ `
	<SCL ${ns} ${id}="template-root">
		<Header id="template" uuid="${OTHER_FILE_UUID}" version="1" revision="B"/>
	</SCL>
`

/** A project whose Header names another file. */
const otherProject = /* xml */ `
	<SCL ${ns} ${id}="project-root">
		<Header id="project" uuid="${BCU1_FILE_UUID}" version="1" revision="A"/>
	</SCL>
`

/** The open document (`targetXml`) and the source file (`sourceXml`), each imported under its name: its extension tells its type. */
type FileNames = { openName: string; sourceName: string }

type PlaceCase = SclTest.BaseXmlTestCase & FileNames & { expected: Record<string, unknown> }

type UpdateCase = PlaceCase & {
	/** The name of the open document's IED the update starts from. */
	updates: string
}

type LayerCase = SclTest.BaseXmlTestCase &
	FileNames & {
		verb: 'fsd' | 'asd' | 'ssd'
		expected: Record<string, unknown>
	}

// The engine tells which scenario an IED placement runs with: the IED of an ISD instance keeps its identity (a fork),
// any other is a new IED. The answer is the scenario and whether both documents are one file, or why it is refused.
describe('query.lifecycle.scenarioOf.ied - the scenario of an IED placed', () => {
	const testCases: SclTest.TestCases<PlaceCase> = {
		'a template ISD placed in a project -> instantiate': {
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdTemplate,
			sourceName: 'BCU_Template.isd',
			expected: { scenario: 'instantiate', sameFile: false },
		},
		'an ISD instance placed in a project that lacks it -> fork, not the same file': {
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.isd',
			expected: { scenario: 'fork', sameFile: false },
		},
		'an ISD instance placed in a project holding its IED -> refused, already in the project': {
			targetXml: projectNorth,
			openName: 'North.ssd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.isd',
			expected: {
				refused: expect.objectContaining({
					code: 'OPTION_NOT_AVAILABLE',
					reason: 'already-in-project',
					meta: { option: 'scenario', value: 'fork' },
				}),
			},
		},
		'an IED read from an IID -> refused, the source is not read': {
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdInstanceOfBcu1,
			sourceName: 'BCU1.iid',
			expected: {
				refused: expect.objectContaining({
					code: 'OPTION_NOT_AVAILABLE',
					reason: 'source-not-read',
					meta: { option: 'source', value: 'iid' },
				}),
			},
		},
		'a source of an extension no IED is read from -> refused, the extension': {
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdTemplate,
			sourceName: 'BCU_Template.fsd',
			expected: {
				refused: expect.objectContaining({
					code: 'OPTION_NOT_AVAILABLE',
					reason: 'source-extension',
					meta: { option: 'sourceExtension', value: '.fsd' },
				}),
			},
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<PlaceCase>): Promise<void> {
		const { open, source } = await openCaseFiles({ project, testCase })
		const ref = await iedNamed({ query: source.query })
		await expect(
			open.query.lifecycle.scenarioOf.ied({ sourceQuery: source.query, ref }),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The engine tells which scenario an update of an IED runs with: on an open ISD, another version of its file or another
// ISD instance is a fork (refused when it is no version of it), any other source is the template the IED was placed from.
describe('query.lifecycle.scenarioOf.ied - the scenario of an IED updated', () => {
	const testCases: SclTest.TestCases<UpdateCase> = {
		'the open ISD updated from another version of its file -> fork, the same file': {
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: isdBcu1Version2,
			sourceName: 'BCU1-v2.isd',
			updates: 'BCU1',
			expected: { scenario: 'fork', sameFile: true },
		},
		'the open ISD updated from a revision of its template -> template': {
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: isdTemplateRevised,
			sourceName: 'BCU_Template.isd',
			updates: 'BCU1',
			expected: { scenario: 'template', sameFile: false },
		},
		'the open ISD updated from another ISD instance -> refused, another file': {
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: anotherIsdInstance,
			sourceName: 'BCU1-other.isd',
			updates: 'BCU1',
			expected: {
				refused: expect.objectContaining({
					code: 'NOT_A_VERSION_OF_FILE',
					reason: 'other-file',
					meta: { reason: 'other-file', fileUuid: BCU1_FILE_UUID, otherFileUuid: OTHER_FILE_UUID },
				}),
			},
		},
		'the open ISD updated from its file holding another IED -> refused, another IED': {
			targetXml: isdBcu1Version1,
			openName: 'BCU1.isd',
			sourceXml: bcu1FileAnotherIed,
			sourceName: 'BCU1-other.isd',
			updates: 'BCU1',
			expected: {
				refused: expect.objectContaining({
					code: 'NOT_A_VERSION_OF_FILE',
					reason: 'other-ied',
					meta: { reason: 'other-ied', iedUuid: BCU1_IED_UUID, otherIedUuid: OTHER_IED_UUID },
				}),
			},
		},
		'an S-IED of a project updated from a revision of its template -> template': {
			targetXml: projectNorth,
			openName: 'North.ssd',
			sourceXml: isdTemplateRevised,
			sourceName: 'BCU_Template.isd',
			updates: 'BCU1',
			expected: { scenario: 'template', sameFile: false },
		},
		'an IED the template placed none of updated from it -> refused, no instance': {
			targetXml: projectSouth,
			openName: 'South.scd',
			sourceXml: isdTemplateRevised,
			sourceName: 'BCU_Template.isd',
			updates: 'R1',
			expected: {
				refused: expect.objectContaining({
					code: 'TARGET_INSTANCE_REQUIRED',
					reason: 'no-instance',
					meta: { instances: [], named: { tagName: 'IED', id: expect.any(String) } },
				}),
			},
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<UpdateCase>): Promise<void> {
		const { open, source } = await openCaseFiles({ project, testCase })
		const ref = await iedNamed({ query: source.query })
		const targetInstance = await iedNamed({ query: open.query, name: testCase.updates })
		await expect(
			open.query.lifecycle.scenarioOf.ied({ sourceQuery: source.query, ref, targetInstance }),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// For an FSD, an ASD or an SSD the consumer states the scenario: the engine tells whether both documents are one file.
describe('query.lifecycle.scenarioOf.fsd / .asd / .ssd - whether the source is the same file', () => {
	const testCases: SclTest.TestCases<LayerCase> = {
		'an FSD revision of the open FSD -> the same file, no scenario': {
			verb: 'fsd',
			targetXml: templateFile,
			openName: 'Protection.fsd',
			sourceXml: templateFileRevised,
			sourceName: 'Protection-B.fsd',
			expected: { sameFile: true },
		},
		'an ASD placed in a project of another file -> not the same file': {
			verb: 'asd',
			targetXml: otherProject,
			openName: 'North.scd',
			sourceXml: templateFile,
			sourceName: 'Feeder.asd',
			expected: { sameFile: false },
		},
		'an SSD revision of the open SSD -> the same file': {
			verb: 'ssd',
			targetXml: templateFile,
			openName: 'Bay.ssd',
			sourceXml: templateFileRevised,
			sourceName: 'Bay-B.ssd',
			expected: { sameFile: true },
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<LayerCase>): Promise<void> {
		const { open, source } = await openCaseFiles({ project, testCase })
		await expect(
			open.query.lifecycle.scenarioOf[testCase.verb]({ sourceQuery: source.query }),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Import the open document and the source file of the case into the project, each under its name, and open them. */
async function openCaseFiles(params: {
	project: SclTest.ActParams<PlaceCase>['project']
	testCase: SclTest.BaseXmlTestCase & FileNames
}) {
	const { project, testCase } = params
	const open = await openFile({ project, xml: testCase.targetXml, fileName: testCase.openName })
	const source = await openFile({ project, xml: testCase.sourceXml, fileName: testCase.sourceName })
	return { open, source }
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
