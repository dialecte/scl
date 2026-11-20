import { elementSignature } from './element-signature'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The value lookups of the calls noted, by the tag looked up. */
function lookupsByTag(
	calls: readonly { method: string; args: unknown[] }[],
): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const call of calls) {
		if (call.method !== 'findByAttributes') continue
		const { tagName } = call.args[0] as { tagName: string }
		counts[tagName] = (counts[tagName] ?? 0) + 1
	}
	return counts
}

/**
 * Contract: a signature resolving its references looks each target tag up once per level of the trees it signs, for
 * every value that level names, whatever their number; a uuid pair asks its next target tag only for the uuids the tag
 * before it did not hold.
 */
describe('elementSignature - one lookup per target tag and level', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		lookups: Record<string, number>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'three DOs naming three DOTypes → one DOType lookup': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<LNodeType id="LN1" lnClass="GGIO" ${id}="lnt-1">
							<DO name="Ind1" type="SPS_A" ${id}="do-1"/>
							<DO name="Ind2" type="SPS_B" ${id}="do-2"/>
							<DO name="Ind3" type="SPS_C" ${id}="do-3"/>
						</LNodeType>
						<DOType id="SPS_A" cdc="SPS" ${id}="dot-a"><DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-a"/></DOType>
						<DOType id="SPS_B" cdc="SPS" ${id}="dot-b"><DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-b"/></DOType>
						<DOType id="SPS_C" cdc="SPS" ${id}="dot-c"><DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-c"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'LNodeType', id: 'lnt-1' },
			lookups: { DOType: 1 },
		},
		'three DOs naming one DOType → one DOType lookup': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<LNodeType id="LN1" lnClass="GGIO" ${id}="lnt-1">
							<DO name="Ind1" type="SPS_A" ${id}="do-1"/>
							<DO name="Ind2" type="SPS_A" ${id}="do-2"/>
							<DO name="Ind3" type="SPS_A" ${id}="do-3"/>
						</LNodeType>
						<DOType id="SPS_A" cdc="SPS" ${id}="dot-a"><DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-a"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'LNodeType', id: 'lnt-1' },
			lookups: { DOType: 1 },
		},
		'a DOType whose two DAs name two EnumTypes → one EnumType lookup, below the one DOType lookup':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<LNodeType id="LN1" lnClass="GGIO" ${id}="lnt-1">
							<DO name="Beh" type="ENS_A" ${id}="do-1"/>
						</LNodeType>
						<DOType id="ENS_A" cdc="ENS" ${id}="dot-a">
							<DA name="stVal" bType="Enum" type="Beh" fc="ST" ${id}="da-1"/>
							<DA name="subVal" bType="Enum" type="Mod" fc="SV" ${id}="da-2"/>
						</DOType>
						<EnumType id="Beh" ${id}="et-beh"><EnumVal ord="1" ${id}="ev-1">on</EnumVal></EnumType>
						<EnumType id="Mod" ${id}="et-mod"><EnumVal ord="1" ${id}="ev-2">on</EnumVal></EnumType>
					</DataTypeTemplates>
				</SCL>
			`,
				ref: { tagName: 'LNodeType', id: 'lnt-1' },
				lookups: { DOType: 1, EnumType: 1 },
			},
		'three function category references naming sub-functions → one Function and one SubFunction lookup':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" uuid="00000000-0000-4000-8000-0000000000f1" ${id}="f1">
							<SubFunction name="SF1" uuid="00000000-0000-4000-8000-0000000000a1" ${id}="sf1"/>
							<SubFunction name="SF2" uuid="00000000-0000-4000-8000-0000000000a2" ${id}="sf2"/>
							<SubFunction name="SF3" uuid="00000000-0000-4000-8000-0000000000a3" ${id}="sf3"/>
						</Function>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000a1" function="S1/F1/SF1" ${id}="ref-1"/>
							<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000a2" function="S1/F1/SF2" ${id}="ref-2"/>
							<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000a3" function="S1/F1/SF3" ${id}="ref-3"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
				ref: { tagName: 'FunctionCategory', id: 'cat1' },
				lookups: { Function: 1, SubFunction: 1 },
			},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, calls } = countQueryReads(source.query)
			await elementSignature(query, { ref: testCase.ref, resolveReferences: true })
			expect(lookupsByTag(calls)).toEqual(testCase.lookups)
		},
	})
})

/** Sign each LNodeType in its own call, every call given the same reference cache. */
async function signEachSharingOneCache(params: {
	query: Parameters<typeof elementSignature>[0]
	typeIds: readonly string[]
}): Promise<void> {
	const referenceCache = new Map()
	for (const typeId of params.typeIds) {
		await elementSignature(params.query, {
			ref: { tagName: 'LNodeType', id: typeId },
			resolveReferences: true,
			referenceCache,
		})
	}
}

/**
 * Contract: the answers a caller shares across calls (`referenceCache`, as `signatureCache`) are not looked up again:
 * two types naming one DOType, signed in two calls, look it up once.
 */
describe('elementSignature - a reference cache shared across calls', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'two LNodeTypes naming one DOType, signed in two calls sharing the cache → one DOType lookup': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<LNodeType id="LNa" lnClass="ENS" ${id}="lnt-a"><DO name="Beh" type="Da" ${id}="do-a"/></LNodeType>
						<LNodeType id="LNb" lnClass="ENS" ${id}="lnt-b"><DO name="Mod" type="Da" ${id}="do-b"/></LNodeType>
						<DOType id="Da" cdc="ENS" ${id}="dot-da"><DA name="stVal" bType="INT32" fc="ST" ${id}="da-da"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source }) => {
			const { query, calls } = countQueryReads(source.query)
			await signEachSharingOneCache({ query, typeIds: ['lnt-a', 'lnt-b'] })
			expect(lookupsByTag(calls)).toEqual({ DOType: 1 })
		},
	})
})

/**
 * Contract: the signature text is the one a lookup per reference gives: a reference naming nothing folds in as
 * `@missing:<value>`, a reference back into the tree being signed as `@cycle:<tag>`, an id and a uuid reference in one
 * tree each as the signature of what it names.
 */
describe('elementSignature - the same text whatever the lookups', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		contains: readonly string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a DO naming no DOType → @missing with its value': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<LNodeType id="LN1" lnClass="GGIO" ${id}="lnt-1">
							<DO name="Ind1" type="SPS_A" ${id}="do-1"/>
							<DO name="Ind2" type="Nope" ${id}="do-2"/>
						</LNodeType>
						<DOType id="SPS_A" cdc="SPS" ${id}="dot-a"><DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-a"/></DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			allowIncoherentReferences: 'a DO names no DOType on purpose',
			ref: { tagName: 'LNodeType', id: 'lnt-1' },
			contains: ['"type":"@sig:@missing:Nope"', '{tag:\\"DOType\\"'],
		},
		'a DAType naming itself through a BDA → @cycle': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<DataTypeTemplates ${id}="dtt-1">
						<DAType id="Loop" ${id}="dat-loop">
							<BDA name="next" bType="Struct" type="Loop" ${id}="bda-1"/>
						</DAType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'DAType', id: 'dat-loop' },
			contains: ['@cycle:DAType'],
		},
		'a reference by uuid next to one by id → each folded as what it names': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" uuid="00000000-0000-4000-8000-0000000000f1" ${id}="f1"/>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000f1" function="S1/F1" ${id}="ref-1"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionCategory', id: 'cat1' },
			contains: ['"functionUuid":"@sig:{tag:\\"Function\\"'],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const signature = await elementSignature(source.query, {
				ref: testCase.ref,
				resolveReferences: true,
			})
			for (const text of testCase.contains) expect(signature).toContain(text)
		},
	})
})

/**
 * Contract: one uuid held in a tree by two references whose pairs name different target tags folds, for each reference,
 * the element its own pair names, the first tag first: a function reference finds an equipment function that a function
 * category reference cannot name.
 */
describe('elementSignature - one uuid under two pairs of different target tags', () => {
	type TestCase = SclTest.BaseXmlTestCase & { contains: readonly string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'a function reference and a category reference holding the uuid of an equipment function → the function reference folds it, the category reference @missing':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="scl-1">
						<Substation name="S1" ${id}="s1">
							<VoltageLevel name="VL1" ${id}="vl1">
								<Bay name="B1" ${id}="b1">
									<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
										<EqFunction name="EQF" uuid="00000000-0000-4000-8000-0000000000e1" ${id}="eqf"/>
									</ConductingEquipment>
									<Private type="eIEC61850-6-100" ${id}="b1-private">
										<eIEC61850-6-100:Application name="App" ${id}="app">
											<eIEC61850-6-100:FunctionRole name="ROLE" ${id}="role">
												<eIEC61850-6-100:FunctionRoleContent ${id}="role-content">
													<eIEC61850-6-100:FunctionRef functionUuid="00000000-0000-4000-8000-0000000000e1" ${id}="function-ref"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
								</Bay>
							</VoltageLevel>
							<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
								<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000e1" ${id}="cat-ref"/>
							</eIEC61850-6-100:FunctionCategory>
						</Substation>
					</SCL>
				`,
				allowIncoherentReferences:
					'a function category reference names an equipment function on purpose',
				contains: [
					'"functionUuid":"@sig:{tag:\\"EqFunction\\"',
					'"functionUuid":"@sig:@missing:00000000-0000-4000-8000-0000000000e1"',
				],
			},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const signature = await elementSignature(source.query, {
				ref: { tagName: 'Substation', id: 's1' },
				resolveReferences: true,
			})
			for (const text of testCase.contains) expect(signature).toContain(text)
		},
	})
})
