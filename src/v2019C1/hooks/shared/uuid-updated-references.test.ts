import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * Contract: a uuid changed on an existing reference gives it the path (a path pair) or the names (a tuple pair) of the
 * element it now names, read inside the transaction right after the write and kept by the commit.
 */
describe('a uuid updated on an existing reference - the path or names of its new target', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		reference: Scl.Ref<Scl.ElementsOf>
		uuidAttribute: string
		newUuid: string
		/** Each attribute read inside the transaction right after the update, with its expected value. */
		readInside: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a function reference given the uuid of another function → its path names that function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<Function name="F1" uuid="00000000-0000-4000-8000-0000000000f1" ${id}="f1"/>
							</Bay>
							<Bay name="B2" ${id}="b2">
								<Function name="F3" uuid="00000000-0000-4000-8000-0000000000f3" ${id}="f3"/>
							</Bay>
						</VoltageLevel>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef functionUuid="00000000-0000-4000-8000-0000000000f1" function="S1/VL1/B1/F1" ${id}="ref-a"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			reference: { tagName: 'FunctionCatRef', id: 'ref-a' },
			uuidAttribute: 'functionUuid',
			newUuid: '00000000-0000-4000-8000-0000000000f3',
			readInside: { function: 'S1/VL1/B2/F3' },
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@functionUuid="00000000-0000-4000-8000-0000000000f3" and @function="S1/VL1/B2/F3"]',
			],
		},
		'an LNode given the uuid of another logical node → its names name that logical node': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub1" name="Sub1">
						<Function ${id}="f1" name="F1">
							<LNode ${id}="lnode1" iedName="PIU" ldInst="PROT" lnClass="PTRC" lnInst="1" prefix="" lnType="PTRC_0" lnUuid="00000000-0000-4000-8000-0000000000d1">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="lns1" sIedName="None" sLnClass="PTRC" sLnInst="1" sPrefix=""/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="ied1" name="PIU">
						<IEDSourceFiles>
							<SclFileReference fileType="ICD"/>
						</IEDSourceFiles>
						<AccessPoint ${id}="ap1" name="AP1">
							<Server ${id}="srv1">
								<Authentication/>
								<LDevice ${id}="ld1" inst="PROT">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_0"/>
									<LN ${id}="ptrc1" lnClass="PTRC" inst="1" prefix="" lnType="PTRC_0" uuid="00000000-0000-4000-8000-0000000000d1"/>
									<LN ${id}="ptrc2" lnClass="PTRC" inst="2" prefix="" lnType="PTRC_0" uuid="00000000-0000-4000-8000-0000000000d2"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			reference: { tagName: 'LNode', id: 'lnode1' },
			uuidAttribute: 'lnUuid',
			newUuid: '00000000-0000-4000-8000-0000000000d2',
			readInside: { lnInst: '2', lnClass: 'PTRC', ldInst: 'PROT', iedName: 'PIU' },
			expectedQueries: [
				'//default:LNode[@lnUuid="00000000-0000-4000-8000-0000000000d2" and @lnInst="2" and @lnClass="PTRC" and @ldInst="PROT" and @iedName="PIU"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async function updateThenRead(tx) {
				await tx.update(testCase.reference, {
					attributes: { [testCase.uuidAttribute]: testCase.newUuid } as never,
				})
				const names = Object.keys(testCase.readInside)
				const values = await Promise.all(
					names.map(function readOne(name) {
						return tx.getAttribute(testCase.reference, { name } as never)
					}),
				)
				expect(Object.fromEntries(names.map((name, index) => [name, values[index]]))).toEqual(
					testCase.readInside,
				)
			})
			return { assertOn: 'source' }
		},
	})
})
