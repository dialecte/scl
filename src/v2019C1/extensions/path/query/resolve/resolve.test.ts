import { parsePathSegments, splitLnodeQualifier } from './parse-path'
import { decomposeLnClassSegment, resolve, resolveByPath } from './resolve'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// ── Pure unit tests: parsePathSegments ───────────────────────────────

describe('parsePathSegments', () => {
	const testCases: Record<
		string,
		{ input: string; expected: { segment: string; separator: '/' | '.' }[] }
	> = {
		'simple slash-separated path': {
			input: 'S1/V1/B1/CE1',
			expected: [
				{ segment: 'S1', separator: '/' },
				{ segment: 'V1', separator: '/' },
				{ segment: 'B1', separator: '/' },
				{ segment: 'CE1', separator: '/' },
			],
		},
		'path with dot separator': {
			input: 'S1/B1/XCBR1.Trip',
			expected: [
				{ segment: 'S1', separator: '/' },
				{ segment: 'B1', separator: '/' },
				{ segment: 'XCBR1', separator: '/' },
				{ segment: 'Trip', separator: '.' },
			],
		},
		'IED path with multiple dots': {
			input: 'IED1/LD0/XCBR1.TrCmd.stVal',
			expected: [
				{ segment: 'IED1', separator: '/' },
				{ segment: 'LD0', separator: '/' },
				{ segment: 'XCBR1', separator: '/' },
				{ segment: 'TrCmd', separator: '.' },
				{ segment: 'stVal', separator: '.' },
			],
		},
		'single segment': {
			input: 'S1',
			expected: [{ segment: 'S1', separator: '/' }],
		},
		'empty string': {
			input: '',
			expected: [],
		},
	}

	Object.entries(testCases).forEach(([description, tc]) => {
		it(description, () => {
			expect(parsePathSegments(tc.input)).toEqual(tc.expected)
		})
	})
})

// ── Pure unit tests: splitLnodeQualifier ─────────────────────────────

describe('splitLnodeQualifier', () => {
	const testCases: Record<
		string,
		{ input: string; expected: { path: string; qualifier?: string } }
	> = {
		'path with DO.DA qualifier': {
			input: 'S1/V1/B1/PXCBR1.Pos.stVal',
			expected: { path: 'S1/V1/B1/PXCBR1', qualifier: 'Pos.stVal' },
		},
		'path with DO qualifier only': {
			input: 'S1/V1/B1/XCBR1.Pos',
			expected: { path: 'S1/V1/B1/XCBR1', qualifier: 'Pos' },
		},
		'path without qualifier': {
			input: 'S1/V1/B1/XCBR1',
			expected: { path: 'S1/V1/B1/XCBR1' },
		},
		'single segment with qualifier': {
			input: 'XCBR1.Pos',
			expected: { path: 'XCBR1', qualifier: 'Pos' },
		},
	}

	Object.entries(testCases).forEach(([description, tc]) => {
		it(description, () => {
			expect(splitLnodeQualifier(tc.input)).toEqual(tc.expected)
		})
	})
})

// ── Pure unit tests: decomposeLnClassSegment ─────────────────────────

describe('decomposeLnClassSegment', () => {
	const testCases: Record<
		string,
		{ input: string; expected: { prefix: string; lnClass: string; inst: string } | null }
	> = {
		'prefixed lnClass with inst': {
			input: 'PXCBR1',
			expected: { prefix: 'P', lnClass: 'XCBR', inst: '1' },
		},
		'lnClass with inst, no prefix': {
			input: 'XCBR1',
			expected: { prefix: '', lnClass: 'XCBR', inst: '1' },
		},
		'lnClass only, no prefix or inst': {
			input: 'XCBR',
			expected: { prefix: '', lnClass: 'XCBR', inst: '' },
		},
		'LLN0 (system logical node)': {
			input: 'LLN0',
			expected: { prefix: '', lnClass: 'LLN0', inst: '' },
		},
		'prefixed MMXU with multi-digit inst': {
			input: 'QMMXU12',
			expected: { prefix: 'Q', lnClass: 'MMXU', inst: '12' },
		},
		'invalid segment — no matching lnClass': {
			input: 'ZZZZ1',
			expected: null,
		},
		'empty string': {
			input: '',
			expected: null,
		},
	}

	Object.entries(testCases).forEach(([description, tc]) => {
		it(description, () => {
			expect(decomposeLnClassSegment(tc.input)).toEqual(tc.expected)
		})
	})
})

// ── Integration tests: resolveByPath ─────────────────────────────────

type ResolveByPathTestCase = SclTest.BaseTestCase & {
	path: string
	expected: { tagName: string; id: string } | null
}

describe('resolveByPath', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<ResolveByPathTestCase> = {
		'process section — named element chain': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<ConductingEquipment name="CE1" ${ID}="ce-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			path: 'S1/V1/B1/CE1',
			expected: { tagName: 'ConductingEquipment', id: 'ce-1' },
		},

		'IED section — AccessPoint and Server transparent': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			path: 'IED1/LD0/XCBR1',
			expected: { tagName: 'LN', id: 'ln-1' },
		},

		'LNode with prefix': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1"/>
					</Bay>
				</Substation>
			</SCL>`,
			path: 'S1/B1/PXCBR1',
			expected: { tagName: 'LNode', id: 'lnode-1' },
		},

		'SourceRef — dot separator': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs-1">
									<eIEC61850-6-100:SourceRef input="Trip" ${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Bay>
				</Substation>
			</SCL>`,
			path: 'S1/B1/PXCBR1.Trip',
			expected: { tagName: 'SourceRef', id: 'sr-1' },
		},

		'Function > SubFunction — nested named elements': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" ${ID}="func-1">
								<SubFunction name="Trip" ${ID}="sfunc-1"/>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			path: 'S1/V1/B1/Prot/Trip',
			expected: { tagName: 'SubFunction', id: 'sfunc-1' },
		},

		'non-existent path — returns null': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1"/>
				</Substation>
			</SCL>`,
			path: 'S1/NonExistent',
			expected: null,
		},

		'empty path — returns undefined': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>`,
			path: '',
			expected: null,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<ResolveByPathTestCase>): Promise<SclTest.ActResult> {
		const query = source.document.query

		const result = await resolveByPath(query, testCase.path)

		if (testCase.expected === null) {
			expect(result).toBeUndefined()
		} else {
			expect(result).toBeDefined()
			expect(result!.tagName).toBe(testCase.expected.tagName)
			expect(result!.id).toBe(testCase.expected.id)
		}

		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases.withExport({ testCases, act })
})

// ── Integration tests: resolve (strategy-aware) ─────────────────────

type ResolveRefTestCase = SclTest.BaseTestCase & {
	refId: string
	refTagName: string
	pathAttribute: string
	expected: { tagName: string; id: string; qualifier?: string } | null
}

describe('resolve', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<ResolveRefTestCase> = {
		'direct — FunctionCatRef.function → Function': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="Protection" ${ID}="func-1" />
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${ID}="fcat-1">
							<eIEC61850-6-100:FunctionCatRef function="S1/Protection" ${ID}="fcatref-1" />
						</eIEC61850-6-100:FunctionCategory>
					</Private>
				</Substation>
			</SCL>`,
			refId: 'fcatref-1',
			refTagName: 'FunctionCatRef',
			pathAttribute: 'function',
			expected: { tagName: 'Function', id: 'func-1' },
		},

		'direct — FunctionRef.function → SubFunction (nested)': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Function name="Prot" ${ID}="func-1">
							<SubFunction name="Trip" ${ID}="sfunc-1" />
						</Function>
					</VoltageLevel>
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:AllocationRole name="AR1" ${ID}="ar-1">
							<eIEC61850-6-100:FunctionRoleContent ${ID}="frc-1">
								<eIEC61850-6-100:FunctionRef function="S1/V1/Prot/Trip" ${ID}="funcref-1" />
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:AllocationRole>
					</Private>
				</Substation>
			</SCL>`,
			refId: 'funcref-1',
			refTagName: 'FunctionRef',
			pathAttribute: 'function',
			expected: { tagName: 'SubFunction', id: 'sfunc-1' },
		},

		'lnode — SourceRef.source with qualifier → LNode + qualifier': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode prefix="P" lnClass="XCBR" lnInst="1" ${ID}="target-lnode" />
						<LNode lnClass="PTRC" lnInst="1" ${ID}="source-lnode">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs-1">
									<eIEC61850-6-100:SourceRef input="Trip" source="S1/B1/PXCBR1.Pos.stVal" sourceDoName="Pos" sourceDaName="stVal" ${ID}="sr-1" />
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Bay>
				</Substation>
			</SCL>`,
			refId: 'sr-1',
			refTagName: 'SourceRef',
			pathAttribute: 'source',
			expected: { tagName: 'LNode', id: 'target-lnode', qualifier: 'Pos.stVal' },
		},

		'lnode — ControlRef.controlled without qualifier → LNode': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode lnClass="PTRC" lnInst="1" ${ID}="target-lnode" />
						<LNode lnClass="XCBR" lnInst="1" ${ID}="source-lnode">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs ${ID}="outputs-1">
									<eIEC61850-6-100:ControlRef output="TripCmd" controlled="S1/B1/PTRC1" controlledDoName="Tr" ${ID}="cr-1" />
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					</Bay>
				</Substation>
			</SCL>`,
			refId: 'cr-1',
			refTagName: 'ControlRef',
			pathAttribute: 'controlled',
			expected: { tagName: 'LNode', id: 'target-lnode' },
		},

		'non-existent target → undefined': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${ID}="fcat-1">
							<eIEC61850-6-100:FunctionCatRef function="S1/NonExistent" ${ID}="fcatref-1" />
						</eIEC61850-6-100:FunctionCategory>
					</Private>
				</Substation>
			</SCL>`,
			refId: 'fcatref-1',
			refTagName: 'FunctionCatRef',
			pathAttribute: 'function',
			expected: null,
		},

		'missing path attribute value → undefined': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="Protection" ${ID}="func-1" />
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${ID}="fcat-1">
							<eIEC61850-6-100:FunctionCatRef ${ID}="fcatref-1" />
						</eIEC61850-6-100:FunctionCategory>
					</Private>
				</Substation>
			</SCL>`,
			refId: 'fcatref-1',
			refTagName: 'FunctionCatRef',
			pathAttribute: 'function',
			expected: null,
		},

		'ancestry disambiguation — same name in different bays': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" ${ID}="func-b1" />
						</Bay>
						<Bay name="B2" ${ID}="bay-2">
							<Function name="Prot" ${ID}="func-b2" />
						</Bay>
					</VoltageLevel>
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${ID}="fcat-1">
							<eIEC61850-6-100:FunctionCatRef function="S1/V1/B2/Prot" ${ID}="fcatref-1" />
						</eIEC61850-6-100:FunctionCategory>
					</Private>
				</Substation>
			</SCL>`,
			refId: 'fcatref-1',
			refTagName: 'FunctionCatRef',
			pathAttribute: 'function',
			expected: { tagName: 'Function', id: 'func-b2' },
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<ResolveRefTestCase>): Promise<SclTest.ActResult> {
		const query = source.document.query

		const records = await query.getRecordsByTagName(testCase.refTagName as Scl.ElementsOf)
		const refRecord = records.find((r) => r.id === testCase.refId)
		expect(refRecord).toBeDefined()

		const result = await resolve(
			query,
			refRecord! as Scl.TrackedRecord<Scl.ElementsOf>,
			testCase.pathAttribute,
		)

		if (testCase.expected === null) {
			expect(result).toBeUndefined()
		} else {
			expect(result).toBeDefined()
			expect(result!.record.tagName).toBe(testCase.expected.tagName)
			expect(result!.record.id).toBe(testCase.expected.id)
			if (testCase.expected.qualifier) {
				expect(result!.qualifier).toBe(testCase.expected.qualifier)
			} else {
				expect(result!.qualifier).toBeUndefined()
			}
		}

		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases.withExport({ testCases, act })
})
