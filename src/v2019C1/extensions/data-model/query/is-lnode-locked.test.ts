import { isLNodeLocked } from './is-lnode-locked'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodeRef: { tagName: 'LNode'; id: string }
	expected: boolean
}

// An LNode is "locked" when it is bound to an IED: iedName is set and is not the
// unbound 'None' marker. Whether the referenced IED currently exists is a cleanup
// concern, not part of the lock. The S-IED specification convention
// (manufacturer="S_IED") is deliberately NOT considered here.
describe('isLNodeLocked', () => {
	const id = CUSTOM_RECORD_ID_ATTRIBUTE

	function doc(lnode: string, ied = ''): string {
		return `
		<SCL ${ALL_XMLNS_NAMESPACES} ${id}="scl-1">
			<Substation name="S1" ${id}="sub-1">
				<VoltageLevel name="V1" ${id}="vl-1">
					<Bay name="B1" ${id}="bay-1">
						${lnode}
					</Bay>
				</VoltageLevel>
			</Substation>
			${ied}
		</SCL>`
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'iedName="None" (unbound) → not locked': {
			sourceXml: doc(
				`<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>`,
			),
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: false,
		},
		'no iedName attribute → not locked': {
			sourceXml: doc(`<LNode lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>`),
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: false,
		},
		'iedName set, referenced IED absent (orphan) → still locked': {
			sourceXml: doc(
				`<LNode iedName="VENDOR_A" ldInst="LD0" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>`,
			),
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: true,
		},
		'iedName set and referenced IED present → locked': {
			sourceXml: doc(
				`<LNode iedName="VENDOR_A" ldInst="LD0" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>`,
				`<IED name="VENDOR_A" manufacturer="SIEMENS" ${id}="ied-1"/>`,
			),
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: true,
		},
		'iedName set and referenced IED is an S-IED → still locked (S_IED not special-cased)': {
			sourceXml: doc(
				`<LNode iedName="S_IED_1" ldInst="LD0" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>`,
				`<IED name="S_IED_1" manufacturer="S_IED" ${id}="ied-1"/>`,
			),
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: true,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const locked = await isLNodeLocked(source.query, testCase.lnodeRef)
		expect(locked).toBe(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
