import { collectDeleteCascade, collectSubtreeIds, readSubtreeRecords } from './orphaned-refs'

import { describe, expect } from 'vitest'

import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import { storedAmong } from '@/v2019C1/test/stored-among'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const XMLNS_VENDOR_NAMESPACE = 'xmlns:vendor="http://vendor.example/private-elements"'
const BUSBAR_NODE_UUID = '00000000-0000-4000-8000-000000000002'

/**
 * A connectivity node and the terminal of a breaker naming it, the terminal holding a text and a vendor Private with a
 * vendor element.
 */
const nodeAndTerminalXml = /* xml */ `
	<SCL ${ns} ${XMLNS_VENDOR_NAMESPACE} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="VL1" ${id}="vl1">
				<Bay name="B1" ${id}="b1">
					<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
						<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="00000000-0000-4000-8000-000000000001" ${id}="feeder">
							<Text ${id}="feeder-text">to the feeder</Text>
							<Private type="vendor-address" ${id}="feeder-private">
								<vendor:Address casdu="10" ioa="1000" ${id}="feeder-address"/>
							</Private>
						</Terminal>
					</ConductingEquipment>
					<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="00000000-0000-4000-8000-000000000001" ${id}="l1"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('cleanOrphanedRefs', () => {
	describe('via document.transaction (delete)', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			// DELETE behavior: FunctionCatRef is NOT in KEEP_ON_ORPHAN_REFS → element deleted
			'delete target → pointing ref deleted': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<VoltageLevel ${id}="vl1" name="V1">
								<Bay ${id}="bay1" name="B1" />
							</VoltageLevel>
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				// the category needs a reference: it goes with its last one, and so does the wrapper it leaves empty
				unexpectedQueries: [
					'//default:Function[@name="F1"]',
					'//v2019C1:FunctionCatRef[@functionUuid="uuid-f1"]',
					'//v2019C1:FunctionCategory',
					'//default:Substation/default:Private',
				],
			},

			'delete target → the category emptied goes, and the reference to it elsewhere': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1" uuid="uuid-cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
								</eIEC61850-6-100:FunctionCategory>
								<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="uuid-hmi">
									<eIEC61850-6-100:FunctionRole name="ROOT">
										<eIEC61850-6-100:FunctionRoleContent>
											<eIEC61850-6-100:FunctionRef function="Sub1/F2" functionUuid="uuid-f2" />
											<eIEC61850-6-100:FunctionCategoryRef functionCategory="Sub1/Cat1" functionCategoryUuid="uuid-cat1" ${id}="cat-ref1" />
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
							<VoltageLevel ${id}="vl1" name="V1">
								<Bay ${id}="bay1" name="B1" />
							</VoltageLevel>
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: [
					'//v2019C1:Application[@name="HMI"]//v2019C1:FunctionRef[@functionUuid="uuid-f2"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionCategory', '//v2019C1:FunctionCategoryRef'],
			},

			'delete target, then a new reference added to its category in the same transaction → the category and the reference to it stay':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="root">
							<Substation ${id}="sub1" name="Sub1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1" uuid="uuid-cat1">
										<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
									</eIEC61850-6-100:FunctionCategory>
									<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="uuid-hmi">
										<eIEC61850-6-100:FunctionRole name="ROOT">
											<eIEC61850-6-100:FunctionRoleContent>
												<eIEC61850-6-100:FunctionRef function="Sub1/F2" functionUuid="uuid-f2" />
												<eIEC61850-6-100:FunctionCategoryRef functionCategory="Sub1/Cat1" functionCategoryUuid="uuid-cat1" ${id}="cat-ref1" />
											</eIEC61850-6-100:FunctionRoleContent>
										</eIEC61850-6-100:FunctionRole>
									</eIEC61850-6-100:Application>
								</Private>
								<VoltageLevel ${id}="vl1" name="V1">
									<Bay ${id}="bay1" name="B1" />
								</VoltageLevel>
								<Function ${id}="f1" name="F1" uuid="uuid-f1" />
								<Function ${id}="f2" name="F2" uuid="uuid-f2" />
							</Substation>
						</SCL>
					`,
					act: async (document) => {
						await document.transaction(async function swapTheReference(tx) {
							await tx.delete({ tagName: 'Function', id: 'f1' })
							await tx.addChild(
								{ tagName: 'FunctionCategory', id: 'fcat1' },
								{
									tagName: 'FunctionCatRef',
									attributes: { function: 'Sub1/F2', functionUuid: 'uuid-f2' },
								},
							)
						})
					},
					expectedQueries: [
						'//v2019C1:FunctionCategory[@name="Cat1"]/v2019C1:FunctionCatRef[@functionUuid="uuid-f2"]',
						'//v2019C1:FunctionCategoryRef[@functionCategoryUuid="uuid-cat1"]',
					],
					unexpectedQueries: ['//default:Function[@name="F1"]'],
				},

			'delete target → unrelated ref untouched': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F2" functionUuid="uuid-f2" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: [
					'//default:Function[@name="F2"]',
					'//v2019C1:FunctionCatRef[@functionUuid="uuid-f2"]',
				],
				unexpectedQueries: ['//default:Function[@name="F1"]'],
			},

			'delete target → only matching ref deleted, other ref preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Function ${id}="f2" name="F2" uuid="uuid-f2" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
									<eIEC61850-6-100:FunctionCatRef ${id}="ref2" function="Sub1/F2" functionUuid="uuid-f2" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Function', id: 'f1' })
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f2"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f1"]'],
			},

			// KEEP behavior: SourceRef IS in KEEP_ON_ORPHAN_REFS → element kept, uuid/path attrs cleared
			'delete target (KEEP ref) → ref element preserved with uuid and path attrs cleared': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" iedName="None" lnClass="XSWI" lnInst="1">
									<eIEC61850-6-100:LNodeInputs ${id}="lni1">
										<eIEC61850-6-100:SourceRef ${id}="sref1" input="Pos" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'LNode', id: 'ln1' })
					})
				},
				expectedQueries: ['//v2019C1:SourceRef'],
				unexpectedQueries: [
					'//v2019C1:SourceRef[@sourceLNodeUuid]',
					'//v2019C1:SourceRef[@source]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source)
				return { assertOn: 'source' }
			},
		})
	})

	/**
	 * An equipment that is not connected has no terminal: deleting a connectivity node deletes the
	 * terminals connected to it, the equipment stays.
	 */
	describe('terminals of a deleted connectivity node', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Core.Document<Config>) => Promise<void>
		}

		const L1 = '00000000-0000-4000-8000-000000000001'
		const BB1 = '00000000-0000-4000-8000-000000000002'
		const sourceXml = /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<PowerTransformer name="T1" type="PTR" ${id}="t1">
						<TransformerWinding name="W1" type="PTW" ${id}="w1">
							<NeutralPoint connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="neutral"/>
						</TransformerWinding>
					</PowerTransformer>
					<VoltageLevel name="VL1" ${id}="vl1">
						<Bay name="B1" ${id}="b1">
							<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
								<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="feeder"/>
							</ConductingEquipment>
							<ConductingEquipment name="QB1" type="DIS" ${id}="qb1">
								<Terminal connectivityNode="S1/VL1/BB/BB1" substationName="S1" voltageLevelName="VL1" bayName="BB" cNodeName="BB1" cNodeUuid="${BB1}" ${id}="busbar-side"/>
							</ConductingEquipment>
							<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="${L1}" ${id}="l1"/>
						</Bay>
						<Bay name="BB" ${id}="bb">
							<ConnectivityNode name="BB1" pathName="S1/VL1/BB/BB1" uuid="${BB1}" ${id}="bb1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`

		const testCases: SclTest.TestCases<TestCase> = {
			'node deleted → its terminals deleted, the equipment and other terminals kept': {
				sourceXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'ConnectivityNode', id: 'l1' })
					})
				},
				expectedQueries: [
					'//default:ConductingEquipment[@name="QA1"]',
					'//default:TransformerWinding[@name="W1"]',
					`//default:ConductingEquipment[@name="QB1"]/default:Terminal[@cNodeUuid="${BB1}"]`,
				],
				unexpectedQueries: [`//default:*[@cNodeUuid="${L1}"]`],
			},
			'busbar Bay deleted → the terminals of other bays connected to its node deleted': {
				sourceXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'Bay', id: 'bb' })
					})
				},
				expectedQueries: [
					'//default:ConductingEquipment[@name="QB1"]',
					`//default:Terminal[@cNodeUuid="${L1}"]`,
				],
				unexpectedQueries: [`//default:Terminal[@cNodeUuid="${BB1}"]`],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await testCase.act(source)
				return { assertOn: 'source' }
			},
		})
	})
})

// ── What a deleted reference holds goes with it ───────────────────────────────

const PRIVATE_6_100 = 'eIEC61850-6-100'

/**
 * An application whose role holds a reference to F1 with a signal role (an output reference to the control reference
 * of F1, an input reference to the source reference of F2), and a reference to F2 that stays.
 */
const functionReferenceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Private type="${PRIVATE_6_100}" ${id}="application-private">
				<${PRIVATE_6_100}:Application name="A1" ${id}="application">
					<${PRIVATE_6_100}:FunctionRole name="R1" ${id}="role">
						<${PRIVATE_6_100}:FunctionRoleContent ${id}="content">
							<${PRIVATE_6_100}:FunctionRef function="S1/F1" functionUuid="uuid-f1" ${id}="function-ref">
								<${PRIVATE_6_100}:SignalRole name="Signals" ${id}="signal-role">
									<${PRIVATE_6_100}:LNodeInputRef sourceRef="PTRC1/Trip" sourceRefUuid="uuid-source-ref" ${id}="input-ref"/>
									<${PRIVATE_6_100}:LNodeOutputRef controlRef="XCBR1/Oper" controlRefUuid="uuid-control-ref" ${id}="output-ref"/>
								</${PRIVATE_6_100}:SignalRole>
							</${PRIVATE_6_100}:FunctionRef>
							<${PRIVATE_6_100}:FunctionRef function="S1/F2" functionUuid="uuid-f2" ${id}="other-function-ref"/>
						</${PRIVATE_6_100}:FunctionRoleContent>
					</${PRIVATE_6_100}:FunctionRole>
				</${PRIVATE_6_100}:Application>
			</Private>
			<Function name="F1" uuid="uuid-f1" ${id}="f1">
				<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-xcbr" ${id}="xcbr">
					<Private type="${PRIVATE_6_100}" ${id}="xcbr-private">
						<${PRIVATE_6_100}:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="xcbr-spec"/>
						<${PRIVATE_6_100}:LNodeOutputs ${id}="xcbr-outputs">
							<${PRIVATE_6_100}:ControlRef output="Oper" uuid="uuid-control-ref" ${id}="control-ref"/>
						</${PRIVATE_6_100}:LNodeOutputs>
					</Private>
				</LNode>
			</Function>
			<Function name="F2" uuid="uuid-f2" ${id}="f2">
				<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="uuid-ptrc" ${id}="ptrc">
					<Private type="${PRIVATE_6_100}" ${id}="ptrc-private">
						<${PRIVATE_6_100}:LNodeSpecNaming sLnClass="PTRC" sLnInst="1" ${id}="ptrc-spec"/>
						<${PRIVATE_6_100}:LNodeInputs ${id}="ptrc-inputs">
							<${PRIVATE_6_100}:SourceRef input="Trip" uuid="uuid-source-ref" ${id}="source-ref"/>
						</${PRIVATE_6_100}:LNodeInputs>
					</Private>
				</LNode>
			</Function>
		</Substation>
	</SCL>
`

/**
 * Bay BB holds a connectivity node, a function and a logical node; a terminal of another bay names the node and holds,
 * in a Private, `terminalContent`.
 */
function busbarXml(terminalContent: string): string {
	return /* xml */ `
		<SCL ${ns} ${XMLNS_VENDOR_NAMESPACE} ${id}="root">
			<Substation name="S1" ${id}="s1">
				<VoltageLevel name="VL1" ${id}="vl1">
					<Bay name="B1" ${id}="b1">
						<ConductingEquipment name="QB1" type="DIS" ${id}="qb1">
							<Terminal connectivityNode="S1/VL1/BB/BB1" substationName="S1" voltageLevelName="VL1" bayName="BB" cNodeName="BB1" cNodeUuid="${BUSBAR_NODE_UUID}" ${id}="busbar-side">
								<Private type="${PRIVATE_6_100}" ${id}="busbar-private">
									${terminalContent}
								</Private>
							</Terminal>
						</ConductingEquipment>
					</Bay>
					<Bay name="BB" ${id}="bb">
						<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="uuid-bay-lnode" ${id}="bay-lnode">
							<Private type="${PRIVATE_6_100}" ${id}="bay-lnode-private">
								<${PRIVATE_6_100}:LNodeSpecNaming sLnClass="PTRC" sLnInst="1" ${id}="bay-lnode-spec"/>
							</Private>
						</LNode>
						<ConnectivityNode name="BB1" pathName="S1/VL1/BB/BB1" uuid="${BUSBAR_NODE_UUID}" ${id}="bb1"/>
						<Function name="F9" uuid="uuid-f9" ${id}="f9"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

// beside vendor content, so that the Private is not left empty (the commit would delete it as an emptied container)
const functionCatRefInTerminal = /* xml */ `
	<vendor:Address casdu="10" ${id}="busbar-address"/>
	<${PRIVATE_6_100}:FunctionCatRef function="S1/VL1/BB/F9" functionUuid="uuid-f9" ${id}="busbar-cat-ref"/>
`
const sourceRefInTerminal = /* xml */ `<${PRIVATE_6_100}:SourceRef input="Trip" source="S1/VL1/BB/PTRC1.Tr.general" sourceLNodeUuid="uuid-bay-lnode" sourceDoName="Tr" sourceDaName="general" ${id}="busbar-source-ref"/>`

const FUNCTION_1 = { tagName: 'Function', id: 'f1' } as const
const BAY_BB = { tagName: 'Bay', id: 'bb' } as const

/** The ids the transaction stages an operation of `status` for, as the hooks leave them, sorted. */
async function stagedOperationIds(params: {
	document: Core.Document<Config>
	status: Scl.Operation['status']
	write: (tx: Core.Transaction<Config>) => Promise<void>
}): Promise<string[]> {
	const prepared = await params.document.prepare(params.write)
	const ids = prepared.operations
		.filter((operation) => operation.status === params.status)
		.map((operation) => (operation.oldRecord ?? operation.newRecord).id)
	prepared.discard()
	return ids.sort()
}

describe('what a deleted reference holds goes with it', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a function deleted → the signal role of the reference to it and the references in it leave the store':
			{
				sourceXml: functionReferenceXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete(FUNCTION_1)
					})
					const held = [
						{ tagName: 'FunctionRef', id: 'function-ref' },
						{ tagName: 'SignalRole', id: 'signal-role' },
						{ tagName: 'LNodeOutputRef', id: 'output-ref' },
						{ tagName: 'LNodeInputRef', id: 'input-ref' },
					] as const
					const stored = await storedAmong({ document, refs: held })
					expect(stored).toEqual([])
				},
				expectedQueries: [
					'//v2019C1:FunctionRef[@functionUuid="uuid-f2"]',
					'//v2019C1:SourceRef[@uuid="uuid-source-ref"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="uuid-f1"]'],
			},
		'a function deleted → nothing refers to the source reference of another function any more': {
			sourceXml: functionReferenceXml,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete(FUNCTION_1)
				})
				const referrers = await findRefsPointingTo(document.query, {
					target: { tagName: 'SourceRef', id: 'source-ref' },
				})
				expect(referrers).toEqual([])
			},
		},
		'a function deleted, the reference to it read before what it holds → what the reference holds is staged once with it':
			{
				sourceXml: functionReferenceXml,
				act: async (document) => {
					const staged = await stagedOperationIds({
						document,
						status: 'deleted',
						write: async function deleteTheFunction(tx) {
							await tx.delete(FUNCTION_1)
						},
					})
					expect(staged).toEqual(
						[
							// the function with what it holds
							'f1',
							'xcbr',
							'xcbr-private',
							'xcbr-spec',
							'xcbr-outputs',
							'control-ref',
							// the reference to it with what it holds
							'function-ref',
							'signal-role',
							'output-ref',
							'input-ref',
						].sort(),
					)
				},
			},
		'a connectivity node deleted → the text and the private of the terminal, vendor content included, leave the store':
			{
				sourceXml: nodeAndTerminalXml,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.delete({ tagName: 'ConnectivityNode', id: 'l1' })
					})
					const held = [
						{ tagName: 'Terminal', id: 'feeder' },
						{ tagName: 'Text', id: 'feeder-text' },
						{ tagName: 'Private', id: 'feeder-private' },
						{ tagName: 'Address', id: 'feeder-address' },
					] as unknown as Scl.Ref<Scl.ElementsOf>[]
					const stored = await storedAmong({ document, refs: held })
					expect(stored).toEqual([])
				},
			},
		'a bay deleted, a reference inside a terminal read before the terminal → the terminal and what it holds are staged, each once':
			{
				sourceXml: busbarXml(functionCatRefInTerminal),
				act: async (document) => {
					const staged = await stagedOperationIds({
						document,
						status: 'deleted',
						write: async function deleteTheBay(tx) {
							await tx.delete(BAY_BB)
						},
					})
					expect(staged).toEqual(
						[
							// the bay with what it holds
							'bb',
							'bb1',
							'bay-lnode',
							'bay-lnode-private',
							'bay-lnode-spec',
							'f9',
							// the terminal naming its node, with what it holds
							'busbar-side',
							'busbar-private',
							'busbar-address',
							'busbar-cat-ref',
						].sort(),
					)
				},
			},
		'a bay deleted, a reference inside a terminal read before the terminal → the cascade lists the terminal as deleted, not the reference inside it':
			{
				sourceXml: busbarXml(functionCatRefInTerminal),
				act: async (document) => {
					const [bay] = await document.query.getRecords<Scl.ElementsOf>([BAY_BB])
					if (!bay) throw new Error('the bay is in the fixture')
					const cascade = await collectDeleteCascade(document.query, {
						roots: [bay],
						emptiesContainers: false,
					})
					expect(cascade.deleted.map((record) => record.id)).toEqual(['busbar-side'])
				},
			},
		'a bay deleted → a kept reference inside the terminal of another bay is deleted with it, not cleared':
			{
				sourceXml: busbarXml(sourceRefInTerminal),
				act: async (document) => {
					const updated = await stagedOperationIds({
						document,
						status: 'updated',
						write: async function deleteTheBay(tx) {
							await tx.delete(BAY_BB)
						},
					})
					expect(updated).not.toContain('busbar-source-ref')
					await document.transaction(async (tx) => {
						await tx.delete(BAY_BB)
					})
					const held = [
						{ tagName: 'Terminal', id: 'busbar-side' },
						{ tagName: 'SourceRef', id: 'busbar-source-ref' },
					] as const
					const stored = await storedAmong({ document, refs: held })
					expect(stored).toEqual([])
				},
			},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})

// ── The subtree reader ────────────────────────────────────────────────────────

/**
 * Three functions (one nested with vendor content, one empty, one with a sub-function) and a breaker whose terminal
 * holds nothing.
 */
const subtreeXml = /* xml */ `
	<SCL ${ns} ${XMLNS_VENDOR_NAMESPACE} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Function name="F1" ${id}="f1">
				<Private type="vendor-address" ${id}="f1-private">
					<vendor:Address casdu="10" ${id}="f1-address">
						<vendor:Item ${id}="f1-item"/>
					</vendor:Address>
				</Private>
				<SubFunction name="SF1" ${id}="sf1">
					<SubFunction name="SF11" ${id}="sf11"/>
				</SubFunction>
			</Function>
			<Function name="F2" ${id}="f2"/>
			<Function name="F3" ${id}="f3">
				<SubFunction name="SF3" ${id}="sf3"/>
			</Function>
			<VoltageLevel name="VL1" ${id}="vl1">
				<Bay name="B1" ${id}="b1">
					<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
						<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="00000000-0000-4000-8000-000000000003" ${id}="lone-terminal"/>
					</ConductingEquipment>
					<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="00000000-0000-4000-8000-000000000003" ${id}="l1-node"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A record listing more children than the store holds under it. */
function withChildren(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	extra: readonly Scl.Ref<Scl.ElementsOf>[]
}): Scl.RawRecord<Scl.ElementsOf> {
	const { record, extra } = params
	return { ...record, children: [...record.children, ...extra] } as Scl.RawRecord<Scl.ElementsOf>
}

describe('readSubtreeRecords', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The roots, by id (all functions or their children). */
		roots: Scl.Ref<Scl.ElementsOf>[]
		/** Child ids with no record, added to the first root's children as read from the store. */
		phantomChildren?: Scl.Ref<Scl.ElementsOf>[]
		/** The records returned, as `<tag> <id>`: the roots first, then level by level. */
		expectedRecords: string[]
		/** The methods called on the query, in order. */
		expectedReads: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a sub-function holding a sub-function → both levels, the root first, one batched read per level':
			{
				sourceXml: subtreeXml,
				roots: [{ tagName: 'SubFunction', id: 'sf1' }],
				expectedRecords: ['SubFunction sf1', 'SubFunction sf11'],
				expectedReads: ['getRecords'],
			},
		'a function holding a Private with vendor elements → the Private, the vendor elements and their content come back, whatever their tag, one read per level':
			{
				sourceXml: subtreeXml,
				roots: [{ tagName: 'Function', id: 'f1' }],
				expectedRecords: [
					'Function f1',
					'Private f1-private',
					'SubFunction sf1',
					'Address f1-address',
					'SubFunction sf11',
					'Item f1-item',
				],
				expectedReads: ['getRecords', 'getRecords', 'getRecords'],
			},
		'a function holding nothing → itself alone, no read': {
			sourceXml: subtreeXml,
			roots: [{ tagName: 'Function', id: 'f2' }],
			expectedRecords: ['Function f2'],
			expectedReads: [],
		},
		'two roots → both first, in the order given, then their children, in one read': {
			sourceXml: subtreeXml,
			roots: [
				{ tagName: 'Function', id: 'f3' },
				{ tagName: 'Function', id: 'f2' },
				{ tagName: 'Function', id: 'f1' },
			],
			expectedRecords: [
				'Function f3',
				'Function f2',
				'Function f1',
				'SubFunction sf3',
				'Private f1-private',
				'SubFunction sf1',
				'Address f1-address',
				'SubFunction sf11',
				'Item f1-item',
			],
			expectedReads: ['getRecords', 'getRecords', 'getRecords'],
		},
		'a function listing a child id that is no record → skipped, the rest returned, one read, no error':
			{
				sourceXml: subtreeXml,
				roots: [{ tagName: 'Function', id: 'f2' }],
				phantomChildren: [{ tagName: 'SubFunction', id: 'ghost' }],
				expectedRecords: ['Function f2'],
				expectedReads: ['getRecords'],
			},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const found = await source.query.getRecords(testCase.roots)
			const [first, ...others] = found.flatMap((record) => (record ? [record] : []))
			const roots: Scl.RawRecord<Scl.ElementsOf>[] = first
				? [withChildren({ record: first, extra: testCase.phantomChildren ?? [] }), ...others]
				: others
			const { query, reads } = countQueryReads(source.query)
			const subtree = await readSubtreeRecords(query, { records: roots })
			expect({
				records: subtree.map((record) => `${record.tagName} ${record.id}`),
				reads,
			}).toEqual({ records: testCase.expectedRecords, reads: testCase.expectedReads })
		},
	})
})

describe('collectSubtreeIds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		roots: Scl.Ref<Scl.ElementsOf>[]
		/** The ids returned, sorted. */
		expectedIds: string[]
		/** The methods called on the query, in order. */
		expectedReads: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a function holding a nested subtree → every id of it, one batched read per level': {
			sourceXml: subtreeXml,
			roots: [{ tagName: 'Function', id: 'f1' }],
			expectedIds: ['f1', 'f1-address', 'f1-item', 'f1-private', 'sf1', 'sf11'],
			expectedReads: ['getRecords', 'getRecords', 'getRecords'],
		},
		'a terminal holding nothing → its id alone, no read': {
			sourceXml: subtreeXml,
			roots: [{ tagName: 'Terminal', id: 'lone-terminal' }],
			expectedIds: ['lone-terminal'],
			expectedReads: [],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const found = await source.query.getRecords(testCase.roots)
			const roots = found.flatMap((record) => (record ? [record] : []))
			const { query, reads } = countQueryReads(source.query)
			const ids = await collectSubtreeIds(query, { records: roots })
			expect({ ids: [...ids].sort(), reads }).toEqual({
				ids: testCase.expectedIds,
				reads: testCase.expectedReads,
			})
		},
	})
})
