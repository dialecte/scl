import { createDiagnostic } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { SCL_IMPORT_DIAGNOSTICS } from '@/v2019C1/errors'
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

const F1 = '00000000-0000-4000-8000-0000000000f1'
const B1 = '00000000-0000-4000-8000-0000000000b1'
const PTRC = '00000000-0000-4000-8000-0000000000a1'
const XCBR = '00000000-0000-4000-8000-0000000000a2'
const EXTREF = '00000000-0000-4000-8000-0000000000e1'
const ELSEWHERE = '00000000-0000-4000-8000-0000000000e9'

/** The source of the test project the file is imported into: a document holding nothing. */
const EMPTY_SCL = /* xml */ `<SCL ${ns}></SCL>`

describe('import of a reference holding a uuid whose path cannot be written from it', () => {
	type TestCase = {
		xml: string
		expectedDiagnostics: SclImportDiagnostic[]
		// the reference's path attribute read back once imported (`undefined`: absent)
		expectedPath: { ref: { tagName: string; id: string }; name: string; value: string | undefined }
	}

	const testCases: Record<string, TestCase> = {
		// S1 holds the bay B1 and the function F1; its function category names an element by uuid alone, of another file
		'a uuid naming no element of the file → unwritten-reference-path uuid-unresolved, kept as read':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Private type="${bd}">
							<${bd}:FunctionCategory name="Cat1">
								<${bd}:FunctionCatRef functionUuid="${ELSEWHERE}" ${id}="ref"/>
							</${bd}:FunctionCategory>
						</Private>
						<Bay name="B1" uuid="${B1}"/>
						<Function name="F1" uuid="${F1}"/>
					</Substation>
				</SCL>
			`,
				expectedPath: {
					ref: { tagName: 'FunctionCatRef', id: 'ref' },
					name: 'function',
					value: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'FunctionCatRef', id: 'ref', attribute: 'function' },
						meta: {
							uuidAttribute: 'functionUuid',
							uuidValue: ELSEWHERE,
							reason: 'uuid-unresolved' as const,
						},
					}),
				],
			},
		// the same file; the function category names the bay B1 by uuid alone, a bay is no function
		'a uuid naming an element the reference cannot point at → unwritten-reference-path wrong-target':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Private type="${bd}">
							<${bd}:FunctionCategory name="Cat1">
								<${bd}:FunctionCatRef functionUuid="${B1}" ${id}="ref"/>
							</${bd}:FunctionCategory>
						</Private>
						<Bay name="B1" uuid="${B1}"/>
						<Function name="F1" uuid="${F1}"/>
					</Substation>
				</SCL>
			`,
				expectedPath: {
					ref: { tagName: 'FunctionCatRef', id: 'ref' },
					name: 'function',
					value: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'FunctionCatRef', id: 'ref', attribute: 'function' },
						meta: { uuidAttribute: 'functionUuid', uuidValue: B1, reason: 'wrong-target' as const },
					}),
				],
			},
		// IED1's PTRC1 holds an input with no address of its own (no intAddr); F1's LNode bound to PTRC1 names it by uuid alone
		'a uuid naming an element of the file with no path of its own → unwritten-reference-path wrong-target':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1">
							<LNode iedName="IED1" ldInst="LD0" lnClass="PTRC" lnInst="1" uuid="${PTRC}">
								<Private type="${bd}">
									<${bd}:LNodeInputs>
										<${bd}:SourceRef input="Trip" extRefUuid="${EXTREF}" ${id}="sr"/>
									</${bd}:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="IED1">
						<AccessPoint name="AP1">
							<Server>
								<Authentication/>
								<LDevice inst="LD0">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T"/>
									<LN lnClass="PTRC" inst="1" lnType="PTRC_T">
										<Inputs>
											<ExtRef uuid="${EXTREF}" iedName="IED2" ldInst="LD0" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal"/>
										</Inputs>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates>
						<LNodeType id="LLN0_T" lnClass="LLN0"/><LNodeType id="PTRC_T" lnClass="PTRC"/>
					</DataTypeTemplates>
				</SCL>
			`,
				expectedPath: {
					ref: { tagName: 'SourceRef', id: 'sr' },
					name: 'extRefAddr',
					value: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'SourceRef', id: 'sr', attribute: 'extRefAddr' },
						meta: {
							uuidAttribute: 'extRefUuid',
							uuidValue: EXTREF,
							reason: 'wrong-target' as const,
						},
					}),
				],
			},
		// F1 holds PTRC1 and XCBR1; PTRC1's behaviour reads XCBR1's position by uuid alone, XCBR1 out of its reach
		'a behaviour variable naming an LNode out of its reach by uuid → unwritten-reference-path out-of-scope':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1" uuid="${F1}">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
								<Private type="${bd}">
									<${bd}:BehaviorDescription name="B">
										<${bd}:InputVar varName="in" lnodeUuid="${XCBR}" doName="Pos" daName="stVal" ${id}="var"/>
									</${bd}:BehaviorDescription>
								</Private>
							</LNode>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="${XCBR}"/>
						</Function>
					</Substation>
					<DataTypeTemplates>
						<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
						<LNodeType id="XCBR_T" lnClass="XCBR"><DO name="Pos" type="DPC_T"/></LNodeType>
						<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
						<DOType id="DPC_T" cdc="DPC"><DA name="stVal" bType="Dbpos" fc="ST"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
				expectedPath: {
					ref: { tagName: 'InputVar', id: 'var' },
					name: 'dataName',
					value: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'InputVar', id: 'var', attribute: 'dataName' },
						meta: { uuidAttribute: 'lnodeUuid', uuidValue: XCBR, reason: 'out-of-scope' as const },
					}),
				],
			},
		// F1 holds PTRC1; its behaviour names PTRC1 itself by uuid alone, with no data object
		'a behaviour variable naming its own LNode with no data object → unwritten-reference-path data-missing':
			{
				xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Function name="F1" uuid="${F1}">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
								<Private type="${bd}">
									<${bd}:BehaviorDescription name="B">
										<${bd}:InputVar varName="in" lnodeUuid="${PTRC}" ${id}="var"/>
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
				expectedPath: {
					ref: { tagName: 'InputVar', id: 'var' },
					name: 'dataName',
					value: undefined,
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'InputVar', id: 'var', attribute: 'dataName' },
						meta: { uuidAttribute: 'lnodeUuid', uuidValue: PTRC, reason: 'data-missing' as const },
					}),
				],
			},
		// S1 holds F1; its function category names F1 by path, and by a uuid of another file
		'a path naming an element beside a uuid naming no element of the file → path kept, unwritten-reference-path uuid-unresolved':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Private type="${bd}">
								<${bd}:FunctionCategory name="Cat1">
									<${bd}:FunctionCatRef function="S1/F1" functionUuid="${ELSEWHERE}" ${id}="ref"/>
								</${bd}:FunctionCategory>
							</Private>
							<Function name="F1" uuid="${F1}"/>
						</Substation>
					</SCL>
				`,
				expectedPath: {
					ref: { tagName: 'FunctionCatRef', id: 'ref' },
					name: 'function',
					value: 'S1/F1',
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'FunctionCatRef', id: 'ref', attribute: 'function' },
						meta: {
							uuidAttribute: 'functionUuid',
							uuidValue: ELSEWHERE,
							reason: 'uuid-unresolved' as const,
							pathValue: 'S1/F1',
						},
					}),
				],
			},
		// F1 holds PTRC1 and XCBR1; PTRC1's behaviour names its own data by path, and XCBR1, out of its reach, by uuid
		'a local path beside a uuid naming an LNode out of reach → path kept, unwritten-reference-path out-of-scope':
			{
				xml: /* xml */ `
					<SCL ${ns}>
						<Substation name="S1">
							<Function name="F1" uuid="${F1}">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="${PTRC}">
									<Private type="${bd}">
										<${bd}:BehaviorDescription name="B">
											<${bd}:InputVar varName="in" dataName="Op.general" lnodeUuid="${XCBR}" ${id}="var"/>
										</${bd}:BehaviorDescription>
									</Private>
								</LNode>
								<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="${XCBR}"/>
							</Function>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="PTRC_T" lnClass="PTRC"><DO name="Op" type="ACT_T"/></LNodeType>
							<LNodeType id="XCBR_T" lnClass="XCBR"><DO name="Pos" type="DPC_T"/></LNodeType>
							<DOType id="ACT_T" cdc="ACT"><DA name="general" bType="BOOLEAN" fc="ST"/></DOType>
							<DOType id="DPC_T" cdc="DPC"><DA name="stVal" bType="Dbpos" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				expectedPath: {
					ref: { tagName: 'InputVar', id: 'var' },
					name: 'dataName',
					value: 'Op.general',
				},
				expectedDiagnostics: [
					createDiagnostic(SCL_IMPORT_DIAGNOSTICS, 'unwritten-reference-path', {
						ref: { tagName: 'InputVar', id: 'var', attribute: 'dataName' },
						meta: {
							uuidAttribute: 'lnodeUuid',
							uuidValue: XCBR,
							reason: 'out-of-scope' as const,
							pathValue: 'Op.general',
						},
					}),
				],
			},
		// S1 holds F1; its function category names F1 by uuid alone
		'a uuid naming an element whose path is written → no diagnostic': {
			xml: /* xml */ `
				<SCL ${ns}>
					<Substation name="S1">
						<Private type="${bd}">
							<${bd}:FunctionCategory name="Cat1">
								<${bd}:FunctionCatRef functionUuid="${F1}" ${id}="ref"/>
							</${bd}:FunctionCategory>
						</Private>
						<Function name="F1" uuid="${F1}"/>
					</Substation>
				</SCL>
			`,
			expectedPath: {
				ref: { tagName: 'FunctionCatRef', id: 'ref' },
				name: 'function',
				value: 'S1/F1',
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
			const { ref, name, value } = testCase.expectedPath
			const written = await project
				.openDocument(entry.documentId)
				.query.getAttribute(ref as never, { name, defaults: 'none' })
			expect(written || undefined).toBe(value)
		})
	}
})

describe('import of a signal role path below a FunctionRef naming nothing', () => {
	// F1: PTRC1 (input Trip), SF1's XCBR1; A1's FunctionRef names F9 (none) and its signal role PTRC1's missing input
	const FUNCTION_REF_TO_NOTHING = /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Function ${id}="function" name="F1" uuid="function-uuid">
					<LNode ${id}="trip" uuid="trip-uuid" iedName="None" lnClass="PTRC" lnInst="1">
						<Private ${id}="trip-private" type="${bd}">
							<${bd}:LNodeInputs ${id}="inputs">
								<${bd}:SourceRef ${id}="source-ref" uuid="source-ref-uuid" input="Trip" />
							</${bd}:LNodeInputs>
						</Private>
					</LNode>
					<SubFunction ${id}="sub-function" name="SF1" uuid="sub-function-uuid">
						<LNode ${id}="breaker" uuid="breaker-uuid" iedName="None" lnClass="XCBR" lnInst="1">
							<Private ${id}="breaker-private" type="${bd}">
								<${bd}:LNodeOutputs ${id}="outputs">
									<${bd}:ControlRef ${id}="control-ref" uuid="control-ref-uuid" output="Oper" />
								</${bd}:LNodeOutputs>
							</Private>
						</LNode>
					</SubFunction>
				</Function>
				<Private ${id}="application-private" type="${bd}">
					<${bd}:Application ${id}="application" name="A1">
						<${bd}:FunctionRole ${id}="role" name="R1">
							<${bd}:FunctionRoleContent ${id}="content">
								<${bd}:FunctionRef ${id}="function-ref" function="S1/F9" functionUuid="missing-function-uuid">
									<${bd}:SignalRole ${id}="signal-role" name="Signals">
										<${bd}:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Missing" />
									</${bd}:SignalRole>
								</${bd}:FunctionRef>
							</${bd}:FunctionRoleContent>
						</${bd}:FunctionRole>
					</${bd}:Application>
				</Private>
			</Substation>
		</SCL>
	`

	it('no uuid, an absolute path naming nothing -> left as read, one unresolved-reference on the path, the FunctionRef reported unwritten', async () => {
		const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
		const [entry] = await project.import(
			[new File([FUNCTION_REF_TO_NOTHING], 'signal-role.scd', { type: 'text/xml' })],
			{ useCustomRecordsIds: true },
		)
		if (entry?.status !== 'imported') throw new Error('signal-role.scd not imported')
		const written = await project
			.openDocument(entry.documentId)
			.query.getAttribute({ tagName: 'LNodeInputRef', id: 'input-ref' }, { name: 'sourceRef' })
		expect(written).toBe('S1/F1/PTRC1.Missing')
		expect(entry.diagnostics.map(({ code, ref }) => ({ code, ref }))).toEqual([
			{
				code: 'unresolved-reference',
				ref: { tagName: 'LNodeInputRef', id: 'input-ref', attribute: 'sourceRef' },
			},
			{
				code: 'unwritten-reference-path',
				ref: { tagName: 'FunctionRef', id: 'function-ref', attribute: 'function' },
			},
		])
	})
})
