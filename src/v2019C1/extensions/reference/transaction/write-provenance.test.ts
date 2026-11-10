import { writeProvenance } from './write-provenance'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { ProvenanceTarget, SclFileType } from './write-provenance.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	target:
		| { anchor: 'function' | 'application'; rootTag: Scl.ElementsOf; rootId: string }
		| { anchor: 'document'; fileType: SclFileType }
	/** The `changed` flag the writer returns: whether it altered what the document records. */
	expectedChanged: boolean
}

describe('writeProvenance', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE
	const ns = ALL_XMLNS_NAMESPACES

	const testCases: SclTest.TestCases<TestCase> = {
		'FSD: writes a FunctionSclRef -> SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="2" revision="B" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: true,
			expectedQueries: [
				'//default:Function[@name="Prot"]//v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileType="FSD"][@fileUuid="doc-uuid"][@version="2"][@revision="B"]',
			],
			unexpectedQueries: ['//v2019C1:ApplicationSclRef'],
		},

		'ASD: writes an ApplicationSclRef -> SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="3" revision="C" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<Private type="eIEC61850-6-100" ${ID}="priv-1">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-uuid" ${ID}="app-1">
								<eIEC61850-6-100:FunctionRole name="Operator" ${ID}="role-1">
									<eIEC61850-6-100:FunctionRoleContent ${ID}="role-content-1"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			target: { anchor: 'application', rootTag: 'Application', rootId: 'app-1' },
			expectedChanged: true,
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]//v2019C1:ApplicationSclRef/v2019C1:SclFileReference[@fileType="ASD"][@fileUuid="doc-uuid"][@version="3"][@revision="C"]',
			],
			unexpectedQueries: ['//v2019C1:FunctionSclRef'],
		},

		'SSD: appends a Header > SourceFiles > SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="proj" uuid="ssd-uuid" version="0" revision="14" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1"/>
				</SCL>
			`,
			target: { anchor: 'document', fileType: 'SSD' },
			expectedChanged: true,
			expectedQueries: [
				'//default:Header/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileUuid="ssd-uuid"][@version="0"][@revision="14"]',
			],
			unexpectedQueries: ['//v2019C1:FunctionSclRef', '//v2019C1:ApplicationSclRef'],
		},

		'no Header: required version/revision fall back to empty strings, optional fileUuid is omitted':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${ID}="scl-1">
						<Substation name="S1" ${ID}="sub-1">
							<VoltageLevel name="V1" ${ID}="vl-1">
								<Bay name="B1" ${ID}="bay-1">
									<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//default:Function[@name="Prot"]//v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileType="FSD"][@version=""][@revision=""]',
				],
				unexpectedQueries: ['//v2019C1:SclFileReference[@fileUuid]'],
			},

		'coexists with a preserved composition ref (creates a distinct ref, does not overwrite)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="1" revision="A" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1">
									<Private type="eIEC61850-6-100" ${ID}="priv-1">
										<eIEC61850-6-100:FunctionSclRef ${ID}="fnref-1">
											<eIEC61850-6-100:SclFileReference fileType="FSD" fileName="existing.fsd" version="9" revision="Z" ${ID}="fnscl-1"/>
										</eIEC61850-6-100:FunctionSclRef>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: true,
			expectedQueries: [
				// the preserved composition ref is untouched
				'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileName="existing.fsd"][@version="9"][@revision="Z"]',
				// the new instantiation ref is added alongside it
				'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileUuid="doc-uuid"][@version="1"][@revision="A"]',
			],
		},

		'a function holding a vendor Private: the reference lands in a Private of its own type, the vendor one untouched':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${ID}="scl-1">
						<Header id="h" uuid="doc-uuid" version="2" revision="B" ${ID}="hdr-1"/>
						<Substation name="S1" ${ID}="sub-1">
							<VoltageLevel name="V1" ${ID}="vl-1">
								<Bay name="B1" ${ID}="bay-1">
									<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1">
										<Private type="ACME" ${ID}="vendor-1">vendor data</Private>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//default:Function[@name="Prot"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileUuid="doc-uuid"]',
					'//default:Function[@name="Prot"]/default:Private[@type="ACME"][.="vendor data"]',
				],
				unexpectedQueries: [
					'//default:Function/v2019C1:FunctionSclRef',
					'//default:Private[@type="ACME"]/*',
				],
			},

		'a reference the function records of the same file is brought to the source version, in place':
			{
				sourceXml: functionRecording({
					first:
						'fileType="FSD" fileName="old-name.fsd" fileUuid="doc-uuid" version="1" revision="A"',
				}),
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileUuid="doc-uuid"][@version="2"][@revision="B"]',
				],
				unexpectedQueries: [
					'//v2019C1:SclFileReference[@revision="A"]',
					'(//v2019C1:FunctionSclRef)[2]',
				],
			},
		'a reference of the same file and revision but another version is brought to the source version':
			{
				sourceXml: functionRecording({
					first:
						'fileType="FSD" fileName="old-name.fsd" fileUuid="doc-uuid" version="1" revision="B"',
				}),
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//v2019C1:SclFileReference[@fileUuid="doc-uuid"][@version="2"][@revision="B"]',
				],
				unexpectedQueries: ['//v2019C1:SclFileReference[@version="1"]'],
			},
		'a reference of the same file version under another file name is left as it is': {
			sourceXml: functionRecording({
				first:
					'fileType="FSD" fileName="old-name.fsd" fileUuid="doc-uuid" version="2" revision="B"',
			}),
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: false,
			expectedQueries: [
				'//v2019C1:SclFileReference[@fileName="old-name.fsd"][@version="2"][@revision="B"]',
			],
			unexpectedQueries: ['(//v2019C1:FunctionSclRef)[2]'],
		},
		'two references of the same file: one is kept, brought to the source version': {
			sourceXml: functionRecording({
				first: 'fileType="FSD" fileName="a.fsd" fileUuid="doc-uuid" version="1" revision="A"',
				second: 'fileType="FSD" fileName="b.fsd" fileUuid="doc-uuid" version="1" revision="C"',
			}),
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: true,
			expectedQueries: [
				'//v2019C1:SclFileReference[@fileUuid="doc-uuid"][@version="2"][@revision="B"]',
			],
			unexpectedQueries: [
				'(//v2019C1:FunctionSclRef)[2]',
				'//v2019C1:SclFileReference[@version="1"]',
			],
		},
		'two references of the same file, the first already at the source version: the other is removed':
			{
				sourceXml: functionRecording({
					first: 'fileType="FSD" fileName="a.fsd" fileUuid="doc-uuid" version="2" revision="B"',
					second: 'fileType="FSD" fileName="b.fsd" fileUuid="doc-uuid" version="1" revision="C"',
				}),
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//v2019C1:SclFileReference[@fileName="a.fsd"][@version="2"][@revision="B"]',
				],
				unexpectedQueries: [
					'(//v2019C1:FunctionSclRef)[2]',
					'//v2019C1:SclFileReference[@fileName="b.fsd"]',
				],
			},
		'a reference of another file type of the same uuid is not the source file: one is added': {
			sourceXml: functionRecording({
				first: 'fileType="ASD" fileName="other.asd" fileUuid="doc-uuid" version="1" revision="A"',
			}),
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: true,
			expectedQueries: [
				'//v2019C1:SclFileReference[@fileType="ASD"][@version="1"][@revision="A"]',
				'//v2019C1:SclFileReference[@fileType="FSD"][@version="2"][@revision="B"]',
			],
		},
		'source without uuid: the reference of the same file name without uuid is brought to its version':
			{
				sourceXml: functionRecording({
					first: 'fileType="FSD" fileName="source.xml" version="0" revision="1"',
					second: 'fileType="FSD" fileName="elsewhere" version="0" revision="1"',
					header: false,
				}),
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//v2019C1:SclFileReference[@fileName="source.xml"][@version=""][@revision=""]',
					'//v2019C1:SclFileReference[@fileName="elsewhere"][@version="0"][@revision="1"]',
				],
				unexpectedQueries: ['(//v2019C1:FunctionSclRef)[3]'],
			},
		'source without uuid: a reference holding the file name without its extension is rewritten with it, no second one':
			{
				sourceXml: functionRecording({
					first: 'fileType="FSD" fileName="source" version="0" revision="1"',
					second: 'fileType="FSD" fileName="elsewhere" version="0" revision="1"',
					header: false,
				}),
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
				expectedChanged: true,
				expectedQueries: [
					'//v2019C1:SclFileReference[@fileName="source.xml"][@version=""][@revision=""]',
					'//v2019C1:SclFileReference[@fileName="elsewhere"][@version="0"][@revision="1"]',
				],
				unexpectedQueries: [
					'(//v2019C1:FunctionSclRef)[3]',
					'//v2019C1:SclFileReference[@fileName="source"]',
				],
			},
		'source without uuid: a reference naming a uuid is another file': {
			sourceXml: functionRecording({
				first: 'fileType="FSD" fileName="source" fileUuid="other-uuid" version="0" revision="1"',
				header: false,
			}),
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
			expectedChanged: true,
			expectedQueries: [
				'//v2019C1:SclFileReference[@fileUuid="other-uuid"][@revision="1"]',
				'//v2019C1:SclFileReference[not(@fileUuid)][@version=""]',
			],
		},
		'SSD: a file version the Header lists already is not appended again': {
			sourceXml: headerListing(
				'fileType="SSD" fileName="x" fileUuid="ssd-uuid" version="0" revision="14"',
			),
			target: { anchor: 'document', fileType: 'SSD' },
			expectedChanged: false,
			expectedQueries: ['//default:SourceFiles/default:SclFileReference[@revision="14"]'],
			unexpectedQueries: ['//default:SourceFiles/default:SclFileReference[2]'],
		},
		'SSD: another revision of the file the Header lists is appended after it': {
			sourceXml: headerListing(
				'fileType="SSD" fileName="x" fileUuid="ssd-uuid" version="0" revision="13"',
			),
			target: { anchor: 'document', fileType: 'SSD' },
			expectedChanged: true,
			expectedQueries: [
				'//default:SourceFiles/default:SclFileReference[1][@revision="13"]',
				'//default:SourceFiles/default:SclFileReference[2][@revision="14"]',
			],
		},
		'SSD: the same version of another file type is appended': {
			sourceXml: headerListing(
				'fileType="SCD" fileName="x" fileUuid="ssd-uuid" version="0" revision="14"',
			),
			target: { anchor: 'document', fileType: 'SSD' },
			expectedChanged: true,
			expectedQueries: ['//default:SourceFiles/default:SclFileReference[2][@fileType="SSD"]'],
		},
	}

	/** A function recording the files the attributes name, in a document whose Header is version 2 revision B. */
	function functionRecording(params: { first: string; second?: string; header?: boolean }): string {
		const { first, second, header: withHeader = true } = params
		function reference(referenceParams: { attributes: string; index: number }): string {
			const { attributes, index } = referenceParams
			return /* xml */ `
				<eIEC61850-6-100:FunctionSclRef ${ID}="fnref-${index}">
					<eIEC61850-6-100:SclFileReference ${attributes} ${ID}="fnscl-${index}"/>
				</eIEC61850-6-100:FunctionSclRef>
			`
		}
		const header = withHeader
			? `<Header id="h" uuid="doc-uuid" version="2" revision="B" ${ID}="hdr-1"/>`
			: ''
		return /* xml */ `
			<SCL ${ns} ${ID}="scl-1">
				${header}
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1">
								<Private type="eIEC61850-6-100" ${ID}="priv-1">
									${reference({ attributes: first, index: 1 })}
									${second ? reference({ attributes: second, index: 2 }) : ''}
								</Private>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`
	}

	/** A project of Header version 0 revision 14 already listing the file the attributes name. */
	function headerListing(attributes: string): string {
		return /* xml */ `
			<SCL ${ns} ${ID}="scl-1">
				<Header id="proj" uuid="ssd-uuid" version="0" revision="14" ${ID}="hdr-1">
					<SourceFiles ${ID}="files-1">
						<SclFileReference ${attributes} ${ID}="listed-1"/>
					</SourceFiles>
				</Header>
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>
		`
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const result = await source.transaction(async (tx) => {
			return writeProvenance(tx, {
				sourceQuery: source.query,
				target: provenanceTargetOf(testCase.target),
			})
		})
		expect(result.changed, 'changed').toBe(testCase.expectedChanged)

		return { assertOn: 'source' }
	}

	function provenanceTargetOf(target: TestCase['target']): ProvenanceTarget {
		if (target.anchor === 'document') return { anchor: 'document', fileType: target.fileType }
		if (target.anchor === 'function') {
			return {
				anchor: 'function',
				root: { tagName: target.rootTag, id: target.rootId } as unknown as Scl.Ref<'Function'>,
			}
		}
		return {
			anchor: 'application',
			root: { tagName: target.rootTag, id: target.rootId } as unknown as Scl.Ref<'Application'>,
		}
	}

	runSclTestCases.withExport({ testCases, act })

	for (const { heldName, expected } of [
		{ heldName: 'kept.fsd', expected: 'kept.fsd' },
		{ heldName: undefined, expected: undefined },
	]) {
		it(`a source document without a name: the reference keeps ${heldName ? 'the file name it holds' : 'no file name'}, its version follows`, async () => {
			const { project } = await createSclTestProject({
				sourceXml: `<SCL ${ns} ${ID}="scl-1"></SCL>`,
			})
			const documentId = await project.initEmptyDocument({ name: '' })
			const nameless = project.openDocument(documentId)
			const functionRef = await nameless.transaction(async function buildFunction(tx) {
				const root = await tx.getRoot()
				await tx.addChild(root, {
					tagName: 'Header',
					attributes: { id: 'h', uuid: 'doc-uuid', version: '2', revision: 'B' },
				})
				const substation = await tx.addChild(root, {
					tagName: 'Substation',
					attributes: { name: 'S1' },
				})
				const level = await tx.addChild(substation, {
					tagName: 'VoltageLevel',
					attributes: { name: 'V1' },
				})
				const bay = await tx.addChild(level, { tagName: 'Bay', attributes: { name: 'B1' } })
				const placed = await tx.addChild(bay, {
					tagName: 'Function',
					attributes: { name: 'Prot', uuid: 'fn-uuid' },
				})
				const sclRef = await tx.addChild(placed, { tagName: 'FunctionSclRef' })
				await tx.addChild(sclRef, {
					tagName: 'SclFileReference',
					attributes: {
						fileType: 'FSD',
						fileUuid: 'doc-uuid',
						version: '1',
						revision: 'A',
						...(heldName ? { fileName: heldName } : {}),
					},
				})
				return { tagName: 'Function', id: placed.id } as Scl.Ref<'Function'>
			})
			await nameless.transaction(async function rewrite(tx) {
				await writeProvenance(tx, {
					sourceQuery: nameless.query,
					target: { anchor: 'function', root: functionRef },
				})
			})
			const references = await nameless.query.getRecordsByTagName('SclFileReference')
			const [reference] = references
			const attributes = await nameless.query.getAttributes(reference, { defaults: 'none' })
			expect({
				fileName: attributes.fileName || undefined,
				version: attributes.version,
				revision: attributes.revision,
				references: references.length,
			}).toEqual({ fileName: expected, version: '2', revision: 'B', references: 1 })
		})
	}
})
