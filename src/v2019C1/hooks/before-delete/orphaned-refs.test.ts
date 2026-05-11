import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

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
							<Function ${id}="f1" name="F1" uuid="uuid-f1" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="Cat1">
									<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="Sub1/F1" functionUuid="uuid-f1" />
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
				expectedQueries: ['//v2019C1:FunctionCategory[@name="Cat1"]'],
				unexpectedQueries: [
					'//default:Function[@name="F1"]',
					'//v2019C1:FunctionCatRef[@functionUuid="uuid-f1"]',
				],
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
})
