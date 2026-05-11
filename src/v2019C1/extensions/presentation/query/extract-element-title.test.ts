import { extractElementTitle } from './extract-element-title'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('extractElementTitle', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expectedTitle: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// ── name-based (DEFINITION identityFields) ───────────────────
		'IED with name → name returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a"/>
				</SCL>
			`,
			ref: { tagName: 'IED', id: 'ied-a' },
			expectedTitle: 'IED_A',
		},
		'Bay with name → name returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="BAY1" ${id}="bay1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Bay', id: 'bay1' },
			expectedTitle: 'BAY1',
		},

		// ── inst-based ────────────────────────────────────────────────
		'LDevice with inst → inst returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0"/>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LDevice', id: 'ld0' },
			expectedTitle: 'LD0',
		},

		// ── override: composite LNode ─────────────────────────────────
		'LNode with prefix+lnClass+lnInst → concatenated title': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${id}="lnode-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-1' },
			expectedTitle: 'PXCBR1',
		},
		'LNode with empty prefix → lnClass+lnInst only': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${id}="lnode-2"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-2' },
			expectedTitle: 'XCBR1',
		},

		// ── override: composite LN ────────────────────────────────────
		'LN with prefix+lnClass+inst → concatenated title': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0">
									<LN prefix="P" lnClass="XCBR" inst="1" lnType="t1" ${id}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LN', id: 'ln-1' },
			expectedTitle: 'PXCBR1',
		},

		// ── override: ConnectedAP separator ──────────────────────────
		'ConnectedAP → iedName / apName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Communication ${id}="comm">
						<SubNetwork name="NET" ${id}="net">
							<ConnectedAP iedName="IED_A" apName="AP1" ${id}="cap-1"/>
						</SubNetwork>
					</Communication>
				</SCL>
			`,
			ref: { tagName: 'ConnectedAP', id: 'cap-1' },
			expectedTitle: 'IED_A / AP1',
		},

		// ── override: type-based ──────────────────────────────────────
		'Private with type → type returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<Private type="ECIA.Plant.HMI" ${id}="priv-1"/>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'Private', id: 'priv-1' },
			expectedTitle: 'ECIA.Plant.HMI',
		},

		// ── fallback: unknown / no attributes ─────────────────────────
		'record not found → empty string': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="root"/>`,
			ref: { tagName: 'IED', id: 'does-not-exist' },
			expectedTitle: '',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await extractElementTitle(source.query, testCase.ref)
			expect(result).toBe(testCase.expectedTitle)
		},
	})
})
