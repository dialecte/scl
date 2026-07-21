import { postExtractionCleanup } from './post-extraction-cleanup'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// ── postExtractionCleanup ────────────────────────────────────────────

describe('postExtractionCleanup', () => {
	// ── cleanOrphanedUuidRefs ────────────────────────────────────────

	describe('cleanOrphanedUuidRefs', () => {
		const testCases: SclTest.TestCases = {
			'FunctionRef with existing target → kept intact': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Function name="Prot" uuid="func-uuid-1"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="func-uuid-1"/>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: ['//v2019C1:FunctionRef[@functionUuid="func-uuid-1"]'],
			},
			'FunctionRef with missing target → deleted': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionRef function="S1/Gone" functionUuid="orphan-uuid"/>
							</Private>
						</Substation>
					</SCL>
				`,
				unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="orphan-uuid"]'],
			},
			'SourceRef (keep-on-orphan) with missing target → attrs cleared, element kept': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<VoltageLevel name="V1">
								<Bay name="B1">
									<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="lnode-uuid-1"/>
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:SourceRef input="Trip" source="S1/B1/PTRC1" sourceLNodeUuid="missing-uuid" sourceDoName="Tr" sourceDaName="general"/>
									</Private>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: ['//v2019C1:SourceRef[@input="Trip" and not(@sourceLNodeUuid)]'],
				unexpectedQueries: ['//v2019C1:SourceRef[@sourceLNodeUuid="missing-uuid"]'],
			},
			'multi-ref element: one valid + one orphan → orphan attr cleared, element kept': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<VoltageLevel name="V1">
								<Bay name="B1">
									<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="lnode-uuid-1"/>
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:ControlRef
											output="TripCmd"
											controlled="S1/B1/PTRC1"
											controlledLNodeUuid="lnode-uuid-1"
											controlledDoName="Tr"
											resourceName="S1/B1/PR1"
											resourceUuid="missing-resource-uuid"
										/>
									</Private>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:ControlRef[@controlledLNodeUuid="lnode-uuid-1" and not(@resourceUuid)]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source }) => {
				await source.transaction(async (tx) => {
					await postExtractionCleanup(tx)
				})
				return { assertOn: 'source' }
			},
		})
	})

	// ── cleanOrphanedLNodeBindings ───────────────────────────────────

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
				expectedQueries: ['//default:LNode[@iedName="None" and @lnClass="PTRC"]'],
			},
			'LNode with valid IED → binding preserved': {
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
					'//default:LNode[@iedName="IED1" and @ldInst="LD0" and @lnUuid="ln-uuid-1"]',
				],
			},
			'LNode with missing IED + LNodeSpecNaming → reset from spec naming': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<VoltageLevel name="V1">
								<Bay name="B1">
									<LNode iedName="GONE_IED" ldInst="LD0" lnClass="XSWI" lnInst="2" prefix="PFX" lnUuid="old-uuid">
										<eIEC61850-6-100:LNodeSpecNaming sIedName="GONE_IED" sLdInst="LD0" sLnClass="PTRC" sLnInst="1" sPrefix="SP"/>
									</LNode>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:LNode[@iedName="None" and @lnClass="PTRC" and @lnInst="1" and @prefix="SP" and not(@ldInst) and not(@lnUuid)]',
					'//v2019C1:LNodeSpecNaming[@sIedName="None" and not(@sLdInst)]',
				],
			},
			'LNode with missing IED + no LNodeSpecNaming → all binding attrs cleared': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<VoltageLevel name="V1">
								<Bay name="B1">
									<LNode iedName="GONE_IED" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="old-uuid"/>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:LNode[@iedName="None" and not(@ldInst) and @lnClass="" and not(@lnInst) and not(@lnUuid)]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source }) => {
				await source.transaction(async (tx) => {
					await postExtractionCleanup(tx)
				})
				return { assertOn: 'source' }
			},
		})
	})

	// ── pruneEmptyContainers ─────────────────────────────────────────

	describe('pruneEmptyContainers', () => {
		const testCases: SclTest.TestCases = {
			'FunctionCategory with no FunctionCatRef children → deleted': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="EmptyCat"/>
							</Private>
						</Substation>
					</SCL>
				`,
				unexpectedQueries: ['//v2019C1:FunctionCategory[@name="EmptyCat"]'],
			},
			'FunctionCategory with remaining children → kept': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Function name="F1" uuid="func-uuid-1"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="Cat1">
									<eIEC61850-6-100:FunctionCatRef function="S1/F1" functionUuid="func-uuid-1"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:FunctionCategory[@name="Cat1"]',
					'//v2019C1:FunctionCatRef[@functionUuid="func-uuid-1"]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source }) => {
				await source.transaction(async (tx) => {
					await postExtractionCleanup(tx)
				})
				return { assertOn: 'source' }
			},
		})
	})

	// ── pruneEmptyPrivateElements ────────────────────────────────────

	describe('pruneEmptyPrivateElements', () => {
		const testCases: SclTest.TestCases = {
			'Private with only orphaned ref → Private container deleted': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionRef function="S1/Gone" functionUuid="orphan-uuid"/>
							</Private>
						</Substation>
					</SCL>
				`,
				unexpectedQueries: [
					'//v2019C1:FunctionRef[@functionUuid="orphan-uuid"]',
					'//default:Private[@type="eIEC61850-6-100"]',
				],
			},
			'Private with one orphaned + one valid ref → Private kept': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Header id="TestSCL"/>
						<Substation name="S1">
							<Function name="F1" uuid="f1-uuid"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionRef function="S1/F1" functionUuid="f1-uuid"/>
								<eIEC61850-6-100:FunctionRef function="S1/Gone" functionUuid="orphan-uuid"/>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:Private[@type="eIEC61850-6-100"]',
					'//v2019C1:FunctionRef[@functionUuid="f1-uuid"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionRef[@functionUuid="orphan-uuid"]'],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source }) => {
				await source.transaction(async (tx) => {
					await postExtractionCleanup(tx)
				})
				return { assertOn: 'source' }
			},
		})
	})
})
