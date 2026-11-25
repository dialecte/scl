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

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const bd = 'eIEC61850-6-100'

const PTRC = '00000000-0000-4000-8000-0000000000a1'
const XCBR = '00000000-0000-4000-8000-0000000000a2'
const CONTROL = '00000000-0000-4000-8000-0000000000c1'
const TRIP = '00000000-0000-4000-8000-0000000000c2'

/** The source of the test project the file is imported into: a document holding nothing. */
const EMPTY_SCL = /* xml */ `<SCL ${ns}></SCL>`

/** A file types the LNodes whose data it splits: `PTRC_T` holds `Op.general`, `XCBR_T` holds `Pos.stVal`. */
describe('import of the data names of a reference read with its uuid and its path', () => {
	type TestCase = {
		xml: string
		/** The reference read back after the import, and the attributes it must hold (`undefined`: absent). */
		reference: { tagName: 'InputVar' | 'OutputVar' | 'SourceRef'; id: string }
		expectedAttributes: Record<string, string | undefined>
		expectedDiagnostics: SclImportDiagnostic[]
	}

	const testCases: Record<string, TestCase> = {
		'InputVar of an LNode behaviour, uuid and path agree, no data object → data object and data attribute written, no diagnostic':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
									<Private type="${bd}">
										<${bd}:BehaviorDescription name="B">
											<${bd}:InputVar varName="in" dataName="Op.general" lnodeUuid="${PTRC}" ${id}="var"/>
										</${bd}:BehaviorDescription>
									</Private>
								</LNode>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
							<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				reference: { tagName: 'InputVar', id: 'var' },
				expectedAttributes: {
					dataName: 'Op.general',
					lnodeUuid: PTRC,
					doName: 'Op',
					daName: 'general',
				},
				expectedDiagnostics: [],
			},
		'SourceRef, uuid and path agree, no data object → data object and data attribute written, no diagnostic':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}"/>
								<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="${XCBR}">
									<Private type="${bd}">
										<${bd}:LNodeInputs>
											<${bd}:SourceRef input="Trip" source="S1/F1/PTRC1.Op.general" sourceLNodeUuid="${PTRC}" ${id}="source"/>
										</${bd}:LNodeInputs>
									</Private>
								</LNode>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
							<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				reference: { tagName: 'SourceRef', id: 'source' },
				expectedAttributes: {
					source: 'S1/F1/PTRC1.Op.general',
					sourceLNodeUuid: PTRC,
					sourceDoName: 'Op',
					sourceDaName: 'general',
				},
				expectedDiagnostics: [],
			},
		'OutputVar, uuid and path agree, data object held → nothing written': {
			xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
								<Private type="${bd}">
									<${bd}:BehaviorDescription name="B">
										<${bd}:OutputVar varName="out" dataName="Op.general" lnodeUuid="${PTRC}" doName="Op" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<DataTypeTemplates>
						<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
						<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			reference: { tagName: 'OutputVar', id: 'var' },
			expectedAttributes: {
				dataName: 'Op.general',
				lnodeUuid: PTRC,
				doName: 'Op',
				daName: undefined,
			},
			expectedDiagnostics: [],
		},
		'InputVar, uuid and path agree, a data path the type does not hold → kept as read, data-path-not-split':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
									<Private type="${bd}">
										<${bd}:BehaviorDescription name="B">
											<${bd}:InputVar varName="in" dataName="Op.missing" lnodeUuid="${PTRC}" ${id}="var"/>
										</${bd}:BehaviorDescription>
									</Private>
								</LNode>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
							<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				reference: { tagName: 'InputVar', id: 'var' },
				expectedAttributes: {
					dataName: 'Op.missing',
					lnodeUuid: PTRC,
					doName: undefined,
					daName: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'data-path-not-split', {
						ref: { tagName: 'InputVar', id: 'var', attribute: 'dataName' },
						meta: { pathValue: 'Op.missing' },
					}),
				],
			},
		'SourceRef, path and uuid name two LNodes → uuid wins, the data names untouched, incoherent-reference':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="${PTRC}" ${id}="ptrc"/>
								<SubFunction name="SF1">
									<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="${XCBR}" ${id}="xcbr">
										<Private type="${bd}">
											<${bd}:LNodeInputs>
												<${bd}:SourceRef input="Trip" source="S1/F1/PTRC1.Op.general" sourceLNodeUuid="${XCBR}" ${id}="source"/>
											</${bd}:LNodeInputs>
										</Private>
									</LNode>
								</SubFunction>
							</Function>
						</Substation>
					</SCL>
				`,
				reference: { tagName: 'SourceRef', id: 'source' },
				expectedAttributes: {
					source: 'S1/F1/SF1/XCBR1',
					sourceLNodeUuid: XCBR,
					sourceDoName: undefined,
					sourceDaName: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'incoherent-reference', {
						ref: { tagName: 'SourceRef', id: 'source', attribute: 'source' },
						meta: {
							uuidAttribute: 'sourceLNodeUuid',
							pathValue: 'S1/F1/PTRC1.Op.general',
							uuidValue: XCBR,
						},
						related: [
							{
								ref: { tagName: 'LNode', id: 'xcbr' },
								message: INCOHERENT_REFERENCE_RELATED.uuidTarget,
							},
							{
								ref: { tagName: 'LNode', id: 'ptrc' },
								message: INCOHERENT_REFERENCE_RELATED.pathTarget,
							},
						],
					}),
				],
			},
		'InputVar of a Function behaviour naming data through its LNode, path only → uuid, data object and data attribute written':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<Private type="${bd}">
									<${bd}:BehaviorDescription name="B">
										<${bd}:InputVar varName="in" dataName="SF1/XCBR1.Pos.stVal" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
								<SubFunction name="SF1">
									<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="${XCBR}"/>
								</SubFunction>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="XCBR_T" lnClass="XCBR"><DO name="Pos" type="DPC_T"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC"><DA name="stVal" bType="Dbpos" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				reference: { tagName: 'InputVar', id: 'var' },
				expectedAttributes: {
					dataName: 'SF1/XCBR1.Pos.stVal',
					lnodeUuid: XCBR,
					doName: 'Pos',
					daName: 'stVal',
				},
				expectedDiagnostics: [],
			},
		'OutputVar of a Function behaviour naming data through its LNode, with the matching uuid → data names written, no diagnostic':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1">
								<Private type="${bd}">
									<${bd}:BehaviorDescription name="B">
										<${bd}:OutputVar varName="out" dataName="PTRC1.Op.general" lnodeUuid="${PTRC}" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
								<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}"/>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
							<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				reference: { tagName: 'OutputVar', id: 'var' },
				expectedAttributes: {
					dataName: 'PTRC1.Op.general',
					lnodeUuid: PTRC,
					doName: 'Op',
					daName: 'general',
				},
				expectedDiagnostics: [],
			},
		'InputVar naming data and an input at once → exclusive-reference-groups, each group read as written':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1">
							<Private type="${bd}">
								<${bd}:BehaviorDescription name="B">
									<${bd}:InputVar varName="in" dataName="PTRC1.Op.general" lnodeUuid="${PTRC}" doName="Op" daName="general" inputName="SF1/XCBR1.Trip" ${id}="var"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="${PTRC}"/>
							<SubFunction name="SF1">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="${XCBR}">
									<Private type="${bd}">
										<${bd}:LNodeInputs>
											<${bd}:SourceRef input="Trip" uuid="${TRIP}"/>
										</${bd}:LNodeInputs>
									</Private>
								</LNode>
							</SubFunction>
						</Function>
					</Substation>
				</SCL>
			`,
				reference: { tagName: 'InputVar', id: 'var' },
				expectedAttributes: {
					dataName: 'PTRC1.Op.general',
					lnodeUuid: PTRC,
					doName: 'Op',
					daName: 'general',
					inputName: 'SF1/XCBR1.Trip',
					inputUuid: TRIP,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'exclusive-reference-groups', {
						ref: { tagName: 'InputVar', id: 'var' },
						meta: { attributes: ['dataName', 'lnodeUuid', 'doName', 'daName', 'inputName'] },
					}),
				],
			},
		'OutputVar naming data and a control by their uuids → exclusive-reference-groups, its control not in the file → unwritten-reference-path':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1">
							<Private type="${bd}">
								<${bd}:BehaviorDescription name="B">
									<${bd}:OutputVar varName="out" lnodeUuid="${PTRC}" doName="Op" outputUuid="${CONTROL}" ${id}="var"/>
								</${bd}:BehaviorDescription>
							</Private>
							<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="${PTRC}"/>
						</Function>
					</Substation>
				</SCL>
			`,
				reference: { tagName: 'OutputVar', id: 'var' },
				expectedAttributes: { lnodeUuid: PTRC, doName: 'Op', outputUuid: CONTROL },
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'exclusive-reference-groups', {
						ref: { tagName: 'OutputVar', id: 'var' },
						meta: { attributes: ['lnodeUuid', 'doName', 'outputUuid'] },
					}),
					// the control its uuid names is not in the file: no output path is written
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'OutputVar', id: 'var', attribute: 'outputName' },
						meta: {
							uuidAttribute: 'outputUuid',
							uuidValue: CONTROL,
							reason: 'uuid-unresolved' as const,
						},
					}),
				],
			},
		'OutputVar naming a control only → no diagnostic': {
			xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1">
							<Private type="${bd}">
								<${bd}:BehaviorDescription name="B">
									<${bd}:OutputVar varName="out" outputName="SF1/XCBR1.CTL" outputUuid="${CONTROL}" ${id}="var"/>
								</${bd}:BehaviorDescription>
							</Private>
							<SubFunction name="SF1">
								<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="${XCBR}">
									<Private type="${bd}">
										<${bd}:LNodeOutputs>
											<${bd}:ControlRef output="CTL" uuid="${CONTROL}"/>
										</${bd}:LNodeOutputs>
									</Private>
								</LNode>
							</SubFunction>
						</Function>
					</Substation>
				</SCL>
			`,
			reference: { tagName: 'OutputVar', id: 'var' },
			expectedAttributes: {
				outputName: 'SF1/XCBR1.CTL',
				outputUuid: CONTROL,
				lnodeUuid: undefined,
			},
			expectedDiagnostics: [],
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			assertValidSclXml({ xml: testCase.xml, label: description, requireComplete: false })
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const [entry] = await project.import(
				[new File([testCase.xml], 'file.scd', { type: 'text/xml' })],
				{ useCustomRecordsIds: true },
			)
			if (entry?.status !== 'imported') throw new Error('file.scd not imported')

			expect(entry.diagnostics).toEqual(testCase.expectedDiagnostics)

			const query = project.openDocument(entry.documentId).query
			const attributes: Record<string, string | undefined> = {}
			for (const name of Object.keys(testCase.expectedAttributes)) {
				attributes[name] =
					(await query.any.getAttribute(testCase.reference, { name, defaults: 'none' })) ||
					undefined
			}
			expect(attributes).toEqual(testCase.expectedAttributes)
		})
	}
})
