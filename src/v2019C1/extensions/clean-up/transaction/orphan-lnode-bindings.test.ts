import { resetLNodes } from './orphan-lnode-bindings'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

describe('cleanOrphanedLNodeBindings', () => {
	const testCases: SclTest.TestCases = {
		'LNode with iedName=None → unchanged': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//default:LNode[@iedName="None" and @lnClass="PTRC" and @lnInst="1"]'],
		},

		'LNode with empty iedName → iedName defaulted to None, binding unchanged': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode lnClass="PTRC" lnInst="1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			// Standardization fills the schema default iedName="None" (the canonical
			// "unbound" marker); resetLNodes leaves the binding otherwise unchanged.
			expectedQueries: ['//default:LNode[@iedName="None" and @lnClass="PTRC" and @lnInst="1"]'],
		},

		'LNode with valid IED present → binding preserved': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<IED name="IED1"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="IED1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="ln-uuid-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@iedName="IED1" and @ldInst="LD0" and @lnClass="PTRC" and @lnInst="1" and @lnUuid="ln-uuid-1"]',
			],
		},

		'LNode with missing IED + LNodeSpecNaming → reset with spec naming values': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XSWI" lnInst="2" prefix="OLD" lnUuid="old-uuid" templateUuid="tpl-1">
									<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE_IED" sLdInst="LD0" sLnClass="PTRC" sLnInst="1" sPrefix="SP"/>
								</LNode>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@iedName="None" and @lnClass="PTRC" and @lnInst="1" and @prefix="SP" and @ldInst="" and not(@lnUuid) and not(@templateUuid) and not(@originUuid)]',
				'//v2019C1:LNodeSpecNaming[@sIedName="None" and not(@sLdInst)]',
			],
			unexpectedQueries: [
				'//default:LNode[@iedName="GONE_IED"]',
				'//default:LNode[@lnClass="XSWI"]',
			],
		},

		'LNode with missing IED + LNodeSpecNaming without sPrefix → prefix cleared': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XSWI" lnInst="2" prefix="OLD" lnUuid="old-uuid">
									<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE_IED" sLdInst="LD0" sLnClass="PTRC" sLnInst="1"/>
								</LNode>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@iedName="None" and @lnClass="PTRC" and @lnInst="1" and @prefix="" and @ldInst="" and not(@lnUuid)]',
			],
		},

		'LNode with missing IED + no LNodeSpecNaming → all binding attrs cleared': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="GONE_IED" ldInst="LD0" lnClass="PTRC" lnInst="1" prefix="PFX" lnUuid="old-uuid" templateUuid="tpl-2" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@iedName="None" and @ldInst="" and @lnClass="" and @lnInst="" and @prefix="" and not(@lnUuid) and not(@templateUuid)]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="GONE_IED"]'],
		},

		'multiple LNodes: valid IED + missing IED → only orphan reset': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<IED name="IED1"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="IED1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="ln-1"/>
								<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XCBR" lnInst="2" lnUuid="ln-2"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@iedName="IED1" and @lnUuid="ln-1"]',
				'//default:LNode[@iedName="None" and not(@lnUuid)]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="GONE_IED"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async (tx) => {
				await resetLNodes(tx)
			})
			return { assertOn: 'source' }
		},
	})
})
