import { orphanUuidRefs } from './orphan-uuid-refs'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

describe('cleanOrphanedUuidRefs', () => {
	const testCases: SclTest.TestCases = {
		// ── delete-on-orphan ────────────────────────────────────────

		'FunctionRef with existing target → kept intact': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Function name="Prot" uuid="func-uuid-1"/>
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="AR1">
								<eIEC61850-6-100:FunctionRef function="S1/Prot" functionUuid="func-uuid-1"/>
							</eIEC61850-6-100:AllocationRole>
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
							<eIEC61850-6-100:AllocationRole name="AR1">
								<eIEC61850-6-100:FunctionRef function="S1/Gone" functionUuid="orphan-uuid"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			unexpectedQueries: ['//v2019C1:FunctionRef'],
		},

		'FunctionRef with no uuid attribute → no-op': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:AllocationRole name="AR1">
								<eIEC61850-6-100:FunctionRef function="S1/Prot"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:FunctionRef[@function="S1/Prot"]'],
		},

		// ── keep-on-orphan ──────────────────────────────────────────

		'SourceRef with missing target → attrs cleared, element kept': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef
												input="Trip"
												source="S1/B1/PTRC1"
												sourceLNodeUuid="missing-uuid"
												sourceDoName="Tr"
												sourceDaName="general"
											/>
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:SourceRef[@input="Trip" and not(@sourceLNodeUuid) and not(@source) and not(@sourceDoName) and not(@sourceDaName)]',
			],
		},

		// ── companion attrs ─────────────────────────────────────────

		'ControlRef with orphan controlledLNodeUuid → uuid + path + companion cleared': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs>
											<eIEC61850-6-100:ControlRef
												output="TripCmd"
												controlled="S1/B1/PTRC1"
												controlledLNodeUuid="missing-uuid"
												controlledDoName="Tr"
											/>
										</eIEC61850-6-100:LNodeOutputs>
									</Private>
								</LNode>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:ControlRef[@output="TripCmd" and not(@controlledLNodeUuid) and not(@controlled) and not(@controlledDoName)]',
			],
		},

		// ── multi-ref ───────────────────────────────────────────────

		'ControlRef with one valid + one orphan pair → orphan pair cleared, valid pair kept': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Header id="TestSCL"/>
					<Substation name="S1">
						<VoltageLevel name="V1">
							<Bay name="B1">
								<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="lnode-uuid-1"/>
								<LNode iedName="None" lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs>
											<eIEC61850-6-100:ControlRef
												output="TripCmd"
												controlled="S1/B1/PTRC1"
												controlledLNodeUuid="lnode-uuid-1"
												controlledDoName="Tr"
												resourceName="S1/B1/PR1"
												resourceUuid="missing-resource-uuid"
											/>
										</eIEC61850-6-100:LNodeOutputs>
									</Private>
								</LNode>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:ControlRef[@controlledLNodeUuid="lnode-uuid-1" and @controlledDoName="Tr" and not(@resourceUuid) and not(@resourceName)]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async (tx) => {
				await orphanUuidRefs(tx)
			})
			return { assertOn: 'source' }
		},
	})
})
