import { createDiagnostic } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { INCOHERENT_REFERENCE_RELATED, SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	assertValidSclXml,
	createSclTestProject,
} from '@/v2019C1/test'

import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { ImportEntry } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const L1 = '00000000-0000-4000-8000-000000000001'
const L2 = '00000000-0000-4000-8000-000000000002'
const L9 = '00000000-0000-4000-8000-000000000009'

/** The source of the test project the files are imported into: a document holding nothing. */
const EMPTY_SCL = /* xml */ `<SCL ${ns}></SCL>`

/** A bay holding a terminal and the connectivity nodes `L1` (unless left out) and `L2`. */
function substationWith(params: { terminal: string; withFirstNode?: boolean }): string {
	const { terminal, withFirstNode = true } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="s1">
				<VoltageLevel name="VL1" ${id}="vl1">
					<Bay name="B1" ${id}="b1">
						<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
							${terminal}
						</ConductingEquipment>
						${withFirstNode ? `<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="${L1}" ${id}="l1"/>` : ''}
						<ConnectivityNode name="L2" pathName="S1/VL1/B1/L2" uuid="${L2}" ${id}="l2"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** A function holding the LNodes given. */
function functionWith(lnodes: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="s1">
				<Function name="F1" ${id}="f1">
					${lnodes}
				</Function>
			</Substation>
		</SCL>
	`
}

const CLEAN_FILE = substationWith({
	terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" ${id}="terminal"/>`,
})

describe('import of an SCL file through a project', () => {
	type ImportedFile = {
		name: string
		xml: string
		/** The file is not well-formed XML: it is not checked against the schema. */
		malformed?: boolean
	}

	type ExpectedEntry =
		| { status: 'imported'; fileName: string; diagnostics: SclImportDiagnostic[] }
		| { status: 'failed'; fileName: string; errorKey: string }

	type TestCase = {
		only?: boolean
		files: ImportedFile[]
		expectedEntries: ExpectedEntry[]
		/** Attribute values read in a file's document once every file is imported. */
		expectedAttributes?: {
			fileName: string
			terminalId: string
			name: 'cNodeUuid'
			value: string
		}[]
	}

	const testCases: Record<string, TestCase> = {
		'a coherent file → imported, no diagnostic': {
			files: [{ name: 'clean.scd', xml: CLEAN_FILE }],
			expectedEntries: [{ status: 'imported', fileName: 'clean.scd', diagnostics: [] }],
		},
		'a terminal whose path names no node → one unresolved-reference, on its path attribute': {
			files: [
				{
					name: 'unresolved.scd',
					xml: substationWith({
						terminal: `<Terminal connectivityNode="S1/VL1/B1/L9" cNodeName="L9" ${id}="terminal"/>`,
					}),
				},
			],
			expectedEntries: [
				{
					status: 'imported',
					fileName: 'unresolved.scd',
					diagnostics: [
						createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
							ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
							meta: {
								uuidAttribute: 'cNodeUuid',
								pathValue: 'S1/VL1/B1/L9',
								triedKeys: ['S1/VL1/B1/L9'],
							},
						}),
					],
				},
			],
		},
		'a variable applied to an XPath selector → one unsupported-xpath-reference, on its path attribute':
			{
				files: [
					{
						name: 'xpath.scd',
						xml: /* xml */ `
							<SCL ${ns} ${id}="root">
								<Substation name="S1" ${id}="s1">
									<Private type="eIEC61850-6-100" ${id}="s1-private">
										<eIEC61850-6-100:Variable name="Prefix" value="DV" ${id}="variable">
											<eIEC61850-6-100:VariableApplyTo element=".//LNode" ${id}="apply-to"/>
										</eIEC61850-6-100:Variable>
									</Private>
								</Substation>
							</SCL>
						`,
					},
				],
				expectedEntries: [
					{
						status: 'imported',
						fileName: 'xpath.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unsupported-xpath-reference', {
								ref: { tagName: 'VariableApplyTo', id: 'apply-to', attribute: 'element' },
								meta: { uuidAttribute: 'elementUuid', pathValue: './/LNode' },
							}),
						],
					},
				],
			},
		'a terminal whose path names one node and uuid another → one incoherent-reference naming both nodes':
			{
				files: [
					{
						name: 'incoherent.scd',
						xml: substationWith({
							terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" cNodeUuid="${L2}" ${id}="terminal"/>`,
						}),
					},
				],
				expectedEntries: [
					{
						status: 'imported',
						fileName: 'incoherent.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-reference', {
								ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
								meta: { uuidAttribute: 'cNodeUuid', pathValue: 'S1/VL1/B1/L1', uuidValue: L2 },
								related: [
									{
										ref: { tagName: 'ConnectivityNode', id: 'l2' },
										message: INCOHERENT_REFERENCE_RELATED.uuidTarget,
									},
									{
										ref: { tagName: 'ConnectivityNode', id: 'l1' },
										message: INCOHERENT_REFERENCE_RELATED.pathTarget,
									},
								],
							}),
						],
					},
				],
			},
		'a terminal whose path names nothing and uuid a node → one incoherent-reference naming the uuid node only':
			{
				files: [
					{
						name: 'incoherent-nothing.scd',
						xml: substationWith({
							terminal: `<Terminal connectivityNode="S1/VL1/B1/L9" cNodeName="L9" cNodeUuid="${L2}" ${id}="terminal"/>`,
						}),
					},
				],
				expectedEntries: [
					{
						status: 'imported',
						fileName: 'incoherent-nothing.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-reference', {
								ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
								meta: { uuidAttribute: 'cNodeUuid', pathValue: 'S1/VL1/B1/L9', uuidValue: L2 },
								related: [
									{
										ref: { tagName: 'ConnectivityNode', id: 'l2' },
										message: INCOHERENT_REFERENCE_RELATED.uuidTarget,
									},
								],
							}),
						],
					},
				],
			},
		'a source naming a logical node only by its path → one data-path-not-split, on its path attribute':
			{
				files: [
					{
						name: 'not-split.scd',
						xml: functionWith(/* xml */ `
							<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="sender"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="holder">
								<Private type="eIEC61850-6-100" ${id}="holder-private">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" source="S1/F1/PTRC1" ${id}="source-ref"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						`),
					},
				],
				expectedEntries: [
					{
						status: 'imported',
						fileName: 'not-split.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'data-path-not-split', {
								ref: { tagName: 'SourceRef', id: 'source-ref', attribute: 'source' },
								meta: { pathValue: 'S1/F1/PTRC1' },
							}),
						],
					},
				],
			},
		'a terminal holding the names of another node → one incoherent-path-names listing them': {
			files: [
				{
					name: 'path-names.scd',
					xml: substationWith({
						terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" lineName="X" bayName="B9" cNodeName="L1" ${id}="terminal"/>`,
					}),
				},
			],
			expectedEntries: [
				{
					status: 'imported',
					fileName: 'path-names.scd',
					diagnostics: [
						createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-path-names', {
							ref: { tagName: 'Terminal', id: 'terminal' },
							meta: {
								attributes: [
									{ name: 'lineName', value: 'X', expected: undefined },
									{ name: 'bayName', value: 'B9', expected: 'B1' },
								],
							},
						}),
					],
				},
			],
		},
		'an LNode bound to an IED without its specified naming → one derived-specification-naming carrying it':
			{
				files: [
					{
						name: 'derived.scd',
						xml: functionWith(
							`<LNode iedName="P1" ldInst="LD0" prefix="Main" lnClass="PTOC" lnInst="2" ${id}="lnode"/>`,
						),
					},
				],
				expectedEntries: [
					{
						status: 'imported',
						fileName: 'derived.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'derived-specification-naming', {
								ref: { tagName: 'LNode', id: 'lnode' },
								meta: {
									iedName: 'P1',
									specifiedNaming: [
										{ name: 'sLnClass', value: 'PTOC' },
										{ name: 'sLnInst', value: '2' },
										{ name: 'sPrefix', value: 'Main' },
									],
								},
							}),
						],
					},
				],
			},
		'a malformed file holding a node, then a file naming it → the first failed, the second keeps its reference unresolved':
			{
				files: [
					{
						name: 'malformed.scd',
						xml: /* xml */ `
							<SCL ${ns} ${id}="root">
								<Substation name="S1" ${id}="s1">
									<VoltageLevel name="VL1" ${id}="vl1">
										<Bay name="B1" ${id}="b1">
											<ConnectivityNode name="L9" pathName="S1/VL1/B1/L9" uuid="${L9}" ${id}="l9"/>
										</Bay>
						`,
						malformed: true,
					},
					{
						name: 'naming-it.scd',
						xml: substationWith({
							terminal: `<Terminal connectivityNode="S1/VL1/B1/L9" cNodeName="L9" ${id}="terminal"/>`,
						}),
					},
				],
				expectedEntries: [
					{ status: 'failed', fileName: 'malformed.scd', errorKey: 'PARSE_ERROR' },
					{
						status: 'imported',
						fileName: 'naming-it.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
								ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
								meta: {
									uuidAttribute: 'cNodeUuid',
									pathValue: 'S1/VL1/B1/L9',
									triedKeys: ['S1/VL1/B1/L9'],
								},
							}),
						],
					},
				],
			},
		'a file naming a node only an earlier file holds → the earlier one resolved, the later one unresolved':
			{
				files: [
					{ name: 'holding-it.scd', xml: CLEAN_FILE },
					{
						name: 'naming-it.scd',
						xml: substationWith({
							terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" ${id}="terminal"/>`,
							withFirstNode: false,
						}),
					},
				],
				expectedEntries: [
					{ status: 'imported', fileName: 'holding-it.scd', diagnostics: [] },
					{
						status: 'imported',
						fileName: 'naming-it.scd',
						diagnostics: [
							createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unresolved-reference', {
								ref: { tagName: 'Terminal', id: 'terminal', attribute: 'connectivityNode' },
								meta: {
									uuidAttribute: 'cNodeUuid',
									pathValue: 'S1/VL1/B1/L1',
									triedKeys: ['S1/VL1/B1/L1'],
								},
							}),
						],
					},
				],
				expectedAttributes: [
					{ fileName: 'holding-it.scd', terminalId: 'terminal', name: 'cNodeUuid', value: L1 },
				],
			},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			for (const file of testCase.files) {
				if (!file.malformed)
					assertValidSclXml({ xml: file.xml, label: file.name, requireComplete: false })
			}
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const imported = await project.import(
				testCase.files.map((file) => new File([file.xml], file.name, { type: 'text/xml' })),
				{ useCustomRecordsIds: true },
			)

			expect(imported.map(toExpectedShape)).toEqual(testCase.expectedEntries)

			for (const expected of testCase.expectedAttributes ?? []) {
				const entry = imported.find((candidate) => candidate.fileName === expected.fileName)
				if (entry?.status !== 'imported') throw new Error(`${expected.fileName} not imported`)
				const value = await project
					.openDocument(entry.documentId)
					.query.getAttribute(
						{ tagName: 'Terminal', id: expected.terminalId },
						{ name: expected.name },
					)
				expect(value).toBe(expected.value)
			}
		})
	})
})

/** An entry as a case states it: its status and file, then its diagnostics or the key of its error. */
function toExpectedShape(entry: ImportEntry): {
	status: ImportEntry['status']
	fileName: string
	diagnostics?: unknown[]
	errorKey?: string
} {
	if (entry.status === 'failed') {
		return { status: entry.status, fileName: entry.fileName, errorKey: entry.error.key }
	}
	return { status: entry.status, fileName: entry.fileName, diagnostics: entry.diagnostics }
}
