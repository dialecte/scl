import { getRefEntriesForTarget } from './ref-entry-ops'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { RefEntry } from '@/v2019C1/extensions/reference'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('ref-entry-ops', () => {
	// ── getRefEntriesForTarget ─────────────────────────────────────────────

	describe('getRefEntriesForTarget', () => {
		type TestCase = {
			only?: boolean
			tagName: string
			expected: {
				length: number
				refTagNames: string[]
			}
		}

		const testCases: Record<string, TestCase> = {
			'Function → direct refs (FunctionCatRef, FunctionRef, Resource)': {
				tagName: 'Function',
				expected: {
					length: 3,
					refTagNames: ['FunctionCatRef', 'FunctionRef', 'Resource'],
				},
			},
			'LNode → lnode + behavior-description + direct refs': {
				tagName: 'LNode',
				expected: {
					length: 7,
					refTagNames: [
						'ControlRef',
						'LNodeDataRef',
						'ProcessEcho',
						'Resource',
						'SourceRef',
						'InputVar',
						'OutputVar',
					],
				},
			},
			'ExtRef → ied-address refs (SourceRef)': {
				tagName: 'ExtRef',
				expected: {
					length: 1,
					refTagNames: ['SourceRef'],
				},
			},
			'SourceRef → direct + behavior-description refs (LNodeInputRef, InputVar)': {
				tagName: 'SourceRef',
				expected: {
					length: 2,
					refTagNames: ['InputVar', 'LNodeInputRef'],
				},
			},
			'unknown tagName → empty': {
				tagName: 'Nonexistent',
				expected: { length: 0, refTagNames: [] },
			},
		}

		function act(testCase: TestCase) {
			const entries = getRefEntriesForTarget(testCase.tagName)
			expect(entries).toHaveLength(testCase.expected.length)
			const refTagNames = [...new Set(entries.map((e: RefEntry) => e.refTagName))]
			expect(refTagNames.sort()).toEqual(testCase.expected.refTagNames.sort())
		}

		runSclTestCases.generic(testCases, act)
	})

	// ── updateRefsForEntry ────────────────────────────────────────────────

	describe('updateRefsForEntry', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			act: (document: Scl.Document) => Promise<void>
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'direct — target exists, ref uuid matches → path updated': {
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
						await tx.update(
							{ tagName: 'Function', id: 'f1' },
							{ attributes: { name: 'F1Renamed' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1Renamed"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1"]'],
			},

			'direct — ref uuid does not match → path unchanged': {
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
						await tx.update(
							{ tagName: 'Function', id: 'f1' },
							{ attributes: { name: 'F1Renamed' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F2"]'],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="Sub1/F1Renamed"]'],
			},

			'lnode — rename LNode → ref path updated, qualifier preserved': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" />
							</Function>
							<Function ${id}="f2" name="F2">
								<LNode ${id}="ln2" lnClass="XSWI" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs ${id}="lni1">
											<eIEC61850-6-100:SourceRef ${id}="sref1" source="Sub1/F1/XCBR1.Pos.stVal" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update({ tagName: 'LNode', id: 'ln1' }, { attributes: { lnInst: '2' } })
					})
				},
				expectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR2.Pos.stVal"]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@source="Sub1/F1/XCBR1.Pos.stVal"]'],
			},

			'behavior-description — rename SourceRef.input → InputVar.inputName updated': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="sub1" name="Sub1">
							<Function ${id}="f1" name="F1">
								<LNode ${id}="ln1" lnClass="XCBR" lnInst="1" uuid="uuid-ln1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs ${id}="lni1">
											<eIEC61850-6-100:SourceRef ${id}="sref1" uuid="uuid-sref1" input="TripCmd" source="Sub1/F1/XCBR1" sourceLNodeUuid="uuid-ln1" sourceDoName="Pos" sourceDaName="stVal" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:BehaviorDescription ${id}="bd1" name="BD1">
										<eIEC61850-6-100:InputVar ${id}="ivar1" varName="ivar1" inputName="TripCmd" inputUuid="uuid-sref1" />
									</eIEC61850-6-100:BehaviorDescription>
								</Private>
							</Function>
						</Substation>
					</SCL>
				`,
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'SourceRef', id: 'sref1' },
							{ attributes: { input: 'TripCmd2' } },
						)
					})
				},
				expectedQueries: ['//v2019C1:InputVar[@inputName="TripCmd2"]'],
				unexpectedQueries: ['//v2019C1:InputVar[@inputName="TripCmd"]'],
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
