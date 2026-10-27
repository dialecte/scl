import { asd } from './asd'
import { fsd } from './fsd'
import { ssd } from './ssd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { ExtractOptions } from './extract.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What is extracted: the function, the application or the bay of the project. */
	verb: ExtractVerb
	options?: ExtractOptions
}

type ExtractVerb = 'fsd' | 'asd' | 'ssd'

/** A file reference an element records: the file it was placed from. */
function fileReference(params: {
	wrapper: 'FunctionSclRef' | 'ApplicationSclRef'
	file: string
	fileType: 'FSD' | 'ASD'
}): string {
	const { wrapper, file, fileType } = params
	return /* xml */ `
		<eIEC61850-6-100:${wrapper} ${id}="project-${file}-ref">
			<eIEC61850-6-100:SclFileReference fileName="${file}" fileType="${fileType}" fileUuid="${file}-uuid" version="1" revision="2" ${id}="project-${file}"/>
		</eIEC61850-6-100:${wrapper}>
	`
}

/**
 * A project bay holding an instance of an application template: the application, its allocation role and the
 * category classifying its function carry the lineage of their templates (and an origin); the function, its
 * subfunction (made from another function file) and the breaker carry theirs; the bay, its level and its substation are instances of
 * a bay template. The application, the function and the subfunction record the file each was placed from.
 */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project" version="2007" revision="C" release="5">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" uuid="substation-uuid" templateUuid="substation-template" ${id}="project-substation">
			<Private type="eIEC61850-6-100" ${id}="project-substation-private">
				<eIEC61850-6-100:AllocationRole name="HMI_PC" uuid="role-uuid" templateUuid="role-template" originUuid="role-origin" ${id}="project-role">
					<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="function-uuid" ${id}="project-role-function-ref"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="category-uuid" templateUuid="category-template" originUuid="category-origin" ${id}="project-category">
					<eIEC61850-6-100:FunctionCatRef function="S1/V1/B1/Prot" functionUuid="function-uuid" ${id}="project-category-ref"/>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="V1" uuid="voltage-level-uuid" templateUuid="voltage-level-template" ${id}="project-voltage-level">
				<Bay name="B1" uuid="bay-uuid" templateUuid="bay-template" ${id}="project-bay">
					<Private type="eIEC61850-6-100" ${id}="project-bay-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" templateUuid="application-template" originUuid="application-origin" ${id}="project-application">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="project-function-role">
								<eIEC61850-6-100:FunctionRoleContent ${id}="project-function-role-content">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="function-uuid" ${id}="project-function-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
							<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/HMI_PC" allocationRoleUuid="role-uuid" ${id}="project-role-ref"/>
							${fileReference({ wrapper: 'ApplicationSclRef', file: 'application-library', fileType: 'ASD' })}
						</eIEC61850-6-100:Application>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" templateUuid="breaker-template" ${id}="project-breaker"/>
					<Function name="Prot" uuid="function-uuid" templateUuid="function-template" ${id}="project-function">
						<Text ${id}="project-function-text">Protection</Text>
						<Private type="eIEC61850-6-100" ${id}="project-function-private">
							${fileReference({ wrapper: 'FunctionSclRef', file: 'function-library', fileType: 'FSD' })}
						</Private>
						<SubFunction name="Sub" uuid="subfunction-uuid" templateUuid="subfunction-template" ${id}="project-subfunction">
							<Private type="eIEC61850-6-100" ${id}="project-subfunction-private">
								${fileReference({ wrapper: 'FunctionSclRef', file: 'subfunction-library', fileType: 'FSD' })}
							</Private>
						</SubFunction>
						<GeneralEquipment name="GE1" type="AXN" ${id}="project-function-equipment"/>
						<ConductingEquipment name="QB1" type="DIS" ${id}="project-function-switch"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('extract: the element extracted is a new template, what it holds keeps its lineage', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fsd: the function loses its template link, its subfunction and its category keep theirs': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'fsd',
			expectedQueries: [
				'//default:Function[@name="Prot"]',
				'//default:SubFunction[@name="Sub"][@templateUuid="subfunction-template"]',
				'//v2019C1:FunctionCategory[@name="PROTECTION"][@templateUuid="category-template"][@originUuid="category-origin"]',
				// the equipment the function holds is the function's
				'//default:Function[@name="Prot"]/default:GeneralEquipment[@name="GE1"]',
				'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="QB1"]',
			],
			unexpectedQueries: ['//default:Function[@templateUuid]'],
		},
		'asd: the application loses its template link and its origin, what it composes and refers to keep theirs':
			{
				sourceXml: projectXml,
				targetXml: emptyTargetXml,
				verb: 'asd',
				expectedQueries: [
					'//v2019C1:Application[@name="HMI"]',
					'//default:Function[@name="Prot"][@templateUuid="function-template"]',
					'//default:SubFunction[@name="Sub"][@templateUuid="subfunction-template"]',
					'//v2019C1:AllocationRole[@name="HMI_PC"][@templateUuid="role-template"][@originUuid="role-origin"]',
					'//v2019C1:FunctionCategory[@name="PROTECTION"][@templateUuid="category-template"][@originUuid="category-origin"]',
					// the equipment a composed function holds is the function's
					'//default:Function[@name="Prot"]/default:GeneralEquipment[@name="GE1"]',
					'//default:Function[@name="Prot"]/default:ConductingEquipment[@name="QB1"]',
				],
				unexpectedQueries: [
					'//v2019C1:Application[@templateUuid]',
					'//v2019C1:Application[@originUuid]',
				],
			},
		'ssd: the bay and the levels above it lose their template link, what the bay holds keeps its lineage':
			{
				sourceXml: projectXml,
				targetXml: emptyTargetXml,
				verb: 'ssd',
				expectedQueries: [
					'//default:VoltageLevel[@name="TEMPLATE"]/default:Bay[@name="B1"]',
					'//v2019C1:Application[@name="HMI"][@templateUuid="application-template"][@originUuid="application-origin"]',
					'//default:ConductingEquipment[@name="QA1"][@templateUuid="breaker-template"]',
					'//default:Function[@name="Prot"][@templateUuid="function-template"]',
				],
				unexpectedQueries: [
					'//default:Bay[@templateUuid]',
					'//default:VoltageLevel[@templateUuid]',
					'//default:Substation[@templateUuid]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act: extractFromProject })
})

/** The reference to a file, wherever it sits. */
const recorded = (file: string) => `//v2019C1:SclFileReference[@fileName="${file}"]`

describe('extract: the element extracted no longer records the file it was placed from, what it holds still does', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"fsd: the function's own file reference goes, its subfunction's stays": {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'fsd',
			expectedQueries: [
				`//default:SubFunction[@name="Sub"][@templateUuid="subfunction-template"]/default:Private/v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileName="subfunction-library"][@version="1"][@revision="2"]`,
			],
			unexpectedQueries: [recorded('function-library')],
		},
		"asd: the application's own file reference goes, its function's and subfunction's stay": {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'asd',
			expectedQueries: [
				`//default:Function[@name="Prot"]/default:Private/v2019C1:FunctionSclRef${recorded('function-library').slice(1)}`,
				`//default:SubFunction[@name="Sub"]/default:Private/v2019C1:FunctionSclRef${recorded('subfunction-library').slice(1)}`,
			],
			unexpectedQueries: [recorded('application-library')],
		},
		'ssd: the application and the functions the bay holds keep the files they record': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'ssd',
			expectedQueries: [
				`//v2019C1:Application[@name="HMI"]/v2019C1:ApplicationSclRef${recorded('application-library').slice(1)}`,
				`//default:Function[@name="Prot"]/default:Private/v2019C1:FunctionSclRef${recorded('function-library').slice(1)}`,
				recorded('subfunction-library'),
			],
		},
		'fsd, templateLink keep: the function keeps the file it records': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'fsd',
			options: { templateLink: 'keep' },
			expectedQueries: [recorded('function-library'), recorded('subfunction-library')],
		},
		'asd, templateLink keep: the application keeps the file it records': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'asd',
			options: { templateLink: 'keep' },
			expectedQueries: [recorded('application-library'), recorded('function-library')],
		},
	}

	runSclTestCases.withExport({ testCases, act: extractFromProject })
})

describe('extract options', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fsd, templateLink keep: the function stays an instance of its template': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'fsd',
			options: { templateLink: 'keep' },
			expectedQueries: ['//default:Function[@name="Prot"][@templateUuid="function-template"]'],
		},
		'asd, templateLink keep: the application keeps its template and its origin': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'asd',
			options: { templateLink: 'keep' },
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@templateUuid="application-template"][@originUuid="application-origin"]',
			],
		},
		'ssd, templateLink keep: the bay keeps its template, the levels above it are scaffolding without lineage':
			{
				sourceXml: projectXml,
				targetXml: emptyTargetXml,
				verb: 'ssd',
				options: { templateLink: 'keep' },
				expectedQueries: ['//default:Bay[@name="B1"][@templateUuid="bay-template"]'],
				unexpectedQueries: ['//default:VoltageLevel[@templateUuid]'],
			},
		'as new: a file of its own, version 0, revision 1': {
			sourceXml: projectXml,
			targetXml: emptyTargetXml,
			verb: 'fsd',
			options: { as: 'new' },
			expectedQueries: [
				'//default:Header[@fileType="FSD"][@version="0"][@revision="1"][@uuid][not(@uuid="project-file-uuid")]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: extractFromProject })

	for (const verb of ['fsd', 'asd', 'ssd'] as const) {
		it(`${verb}, as revision: refused as not available yet, the document unchanged`, async () => {
			const { source, target } = await createSclTestProject({
				sourceXml: projectXml,
				targetXml: emptyTargetXml,
			})
			if (!target) throw new Error('target required')
			const before = await target.document.query.getSnapshot({ as: 'xml' })
			const refused = extractFromProject({
				testCase: {
					sourceXml: projectXml,
					targetXml: emptyTargetXml,
					verb,
					options: { as: 'revision' },
				},
				source: source.document,
				target: target.document,
			} as SclTest.ActParams<TestCase>)
			await expect(refused).rejects.toThrow()
			const refusal = toDialecteError(await refused.catch((error: unknown) => error))
			expect({ key: refusal?.key, code: refusal?.code, meta: refusal?.meta }).toEqual({
				key: 'OPTION_NOT_AVAILABLE',
				code: 'SCL1009',
				meta: { option: 'as', value: 'revision' },
			})
			expect(await target.document.query.getSnapshot({ as: 'xml' })).toEqual(before)
		})
	}
})

/** Extract the project's function, application or bay into the target, with the case's options. */
async function extractFromProject({
	testCase,
	source,
	target,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function extract(tx) {
		const common = { sourceQuery: source.query, tool: 'TEST', who: 'test', ...testCase.options }
		if (testCase.verb === 'fsd') {
			await fsd(tx, { ...common, functionRef: { tagName: 'Function', id: 'project-function' } })
		} else if (testCase.verb === 'asd') {
			const applicationRef = {
				tagName: 'Application',
				id: 'project-application',
			} as Scl.Ref<'Application'>
			await asd(tx, { ...common, applicationRef })
		} else {
			await ssd(tx, { ...common, scopeRef: { tagName: 'Bay', id: 'project-bay' } })
		}
	})
	return { assertOn: 'target' }
}
