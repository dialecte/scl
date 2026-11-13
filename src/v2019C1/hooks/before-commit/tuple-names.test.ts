import { widen } from '@dialecte/core/helpers'
import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const INPUTS = { tagName: 'Inputs', id: 'p1-inputs' } as const
const P2_LD = { tagName: 'LDevice', id: 'p2-ld' } as const

const P1_LD = { tagName: 'LDevice', id: 'p1-ld' } as const
const SUBSCRIPTION = { tagName: 'ExtRef', id: 'subscription' } as const

const NEW_LN = {
	prefix: 'Q1',
	lnClass: 'XCBR',
	inst: '1',
	lnType: 'XCBR_T',
	uuid: 'new-ln-uuid',
}
const NAMES_NOTHING = { lnUuid: 'new-ln-uuid', doName: 'Pos', intAddr: 'Pos' }
const NAMED_EXT_REF =
	'//default:ExtRef[@intAddr="Pos"][@lnUuid="new-ln-uuid"][@iedName="P2"][@ldInst="LD0"][@prefix="Q1"][@lnClass="XCBR"][@lnInst="1"]'

// P1 holds empty `Inputs`; P2 holds the logical device `LD0`, no logical node but its LN0.
const TWO_DEVICES = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs"/>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// The same, but P1's inputs hold an ExtRef naming the logical node `new-ln-uuid` by other names than P2's.
const STALE_EXT_REF = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="subscription" lnUuid="new-ln-uuid" iedName="P9" ldInst="LD9" lnClass="MMXU" lnInst="7" doName="Pos" intAddr="Pos"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// P1 holds, in its inputs, the ExtRef naming the new logical node by uuid with iedName `@`; P2 holds the logical device `LD0`.
const RELATIVE_EXT_REF = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="subscription" lnUuid="new-ln-uuid" iedName="@" ldInst="LD9" lnClass="MMXU" lnInst="7" doName="Pos" intAddr="Pos"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// P1's ExtRef names by uuid a logical node of P2 (with stale names) and, by `srcCBUuid`, the access point a
// ConnectedAP names: a uuid naming an element of another kind than its pair's, its control block names left as written.
const CROSS_KIND_EXT_REF = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<Communication ${id}="communication">
			<SubNetwork ${id}="subnetwork" name="W1">
				<ConnectedAP ${id}="connected-ap" iedName="P1" apName="AP9" apUuid="new-ap-uuid"/>
			</SubNetwork>
		</Communication>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="subscription" lnUuid="new-ln-uuid" iedName="P9" ldInst="LD9" lnClass="MMXU" lnInst="7" doName="Pos" intAddr="Pos" serviceType="GOOSE" srcCBUuid="new-ap-uuid" srcLDInst="LD0" srcPrefix="Z" srcLNClass="LLN0" srcLNInst="3" srcCBName="gcb"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// P1's ExtRef names the logical node `new-ln-uuid` by other names; no other IED, the types a new IED's logical nodes use.
const STALE_EXT_REF_WITH_TYPES = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="subscription" lnUuid="new-ln-uuid" iedName="P9" ldInst="LD9" lnClass="MMXU" lnInst="7" doName="Pos" intAddr="Pos"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="templates">
			<LNodeType ${id}="lln0-type" id="LLN0_T" lnClass="LLN0"/>
			<LNodeType ${id}="xcbr-type" id="XCBR_T" lnClass="XCBR"/>
		</DataTypeTemplates>
	</SCL>`

// A transaction that creates tuple targets (logical nodes, control blocks) has the references naming
// them by uuid written their names once, at the commit, over the records the transaction leaves.
describe('the commit writes the names of the tuple targets a transaction created', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The elements the transaction adds, in order. */
		created: {
			/** An element of the source, or the position in `created` of one the transaction added before. */
			parent: Scl.Ref<Scl.ElementsOf> | number
			tagName: Scl.ElementsOf
			attributes: Record<string, string>
		}[]
		/** Positions in `created` of the elements the transaction deletes after adding them all. */
		deletes?: number[]
		/** The updates the caller makes after adding them all. */
		updates?: { ref: Scl.Ref<'ExtRef'>; attributes: Record<string, string> }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef with stale names naming a logical node by uuid, the logical node created → the names of the logical node written':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
				sourceXml: STALE_EXT_REF,
				created: [{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN }],
				expectedQueries: [NAMED_EXT_REF],
			},
		'ExtRef created before the logical node it names by uuid, in one transaction → the names of the logical node written':
			{
				sourceXml: TWO_DEVICES,
				created: [
					{ parent: INPUTS, tagName: 'ExtRef', attributes: NAMES_NOTHING },
					{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN },
				],
				expectedQueries: [NAMED_EXT_REF],
			},
		'ExtRef created after the logical node it names by uuid, in one transaction → the names of the logical node written':
			{
				sourceXml: TWO_DEVICES,
				created: [
					{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN },
					{ parent: INPUTS, tagName: 'ExtRef', attributes: NAMES_NOTHING },
				],
				expectedQueries: [NAMED_EXT_REF],
			},
		'logical node created then deleted in one transaction, an ExtRef naming it with stale names → the ExtRef keeps its names':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names never exists',
				sourceXml: STALE_EXT_REF,
				created: [{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN }],
				deletes: [0],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P9"][@ldInst="LD9"][@lnClass="MMXU"][@lnInst="7"]',
				],
			},
		'ExtRef naming by uuid a logical node of its own IED with iedName "@", the logical node created there → the "@" stays, the other names written':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
				sourceXml: RELATIVE_EXT_REF,
				created: [{ parent: P1_LD, tagName: 'LN', attributes: NEW_LN }],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="@"][@ldInst="LD0"][@prefix="Q1"][@lnClass="XCBR"][@lnInst="1"]',
				],
			},
		'ExtRef naming by uuid a logical node of another IED with iedName "@", the logical node created there → the IED name written':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
				sourceXml: RELATIVE_EXT_REF,
				created: [{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN }],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@ldInst="LD0"][@prefix="Q1"][@lnClass="XCBR"][@lnInst="1"]',
				],
			},
		'logical node created, then the caller sets the iedName of the ExtRef naming it to another IED → the names of the logical node written (the uuid wins)':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
				sourceXml: STALE_EXT_REF,
				created: [{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN }],
				updates: [{ ref: SUBSCRIPTION, attributes: { iedName: 'P8' } }],
				expectedQueries: [NAMED_EXT_REF],
			},
		'ExtRef naming a created logical node by lnUuid and, by srcCBUuid, a created access point a ConnectedAP names → the names of the logical node written, its control block names kept':
			{
				allowIncoherentReferences:
					'the targets the ExtRef names are created by the case; its srcCBUuid names an access point',
				allowInvalidOutput: {
					reason:
						'the srcCBUuid of the ExtRef names the access point the case creates: the case is that wrong kind',
					violations: [{ check: 'references', code: 'wrong-target' }],
				},
				sourceXml: CROSS_KIND_EXT_REF,
				created: [
					{
						parent: { tagName: 'IED', id: 'p2' },
						tagName: 'AccessPoint',
						attributes: { name: 'AP2', uuid: 'new-ap-uuid' },
					},
					{ parent: P2_LD, tagName: 'LN', attributes: NEW_LN },
				],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P2"][@ldInst="LD0"][@prefix="Q1"][@lnClass="XCBR"][@lnInst="1"][@srcLDInst="LD0"][@srcPrefix="Z"][@srcLNClass="LLN0"][@srcLNInst="3"][@srcCBName="gcb"]',
					'//default:ConnectedAP[@apUuid="new-ap-uuid"][@iedName="P2"][@apName="AP2"]',
				],
			},
		'ExtRef with stale names naming a logical node by uuid, its IED created whole in one transaction → the names of the logical node written':
			{
				allowIncoherentReferences: 'the logical node the ExtRef names is created by the case',
				sourceXml: STALE_EXT_REF_WITH_TYPES,
				created: [
					{ parent: { tagName: 'SCL', id: 'root' }, tagName: 'IED', attributes: { name: 'P3' } },
					{ parent: 0, tagName: 'AccessPoint', attributes: { name: 'AP1' } },
					{ parent: 1, tagName: 'Server', attributes: {} },
					{ parent: 2, tagName: 'Authentication', attributes: {} },
					{ parent: 2, tagName: 'LDevice', attributes: { inst: 'LDX' } },
					{
						parent: 4,
						tagName: 'LN0',
						attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T' },
					},
					{ parent: 4, tagName: 'LN', attributes: NEW_LN },
				],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@lnUuid="new-ln-uuid"][@iedName="P3"][@ldInst="LDX"][@prefix="Q1"][@lnClass="XCBR"][@lnInst="1"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { created, deletes = [], updates = [] } = testCase
		await source.transaction(async (tx) => {
			const added = []
			for (const { parent, tagName, attributes } of created) {
				const holder = typeof parent === 'number' ? widen(added[parent]) : parent
				const child = await tx.any.addChild(holder, { tagName, attributes })
				added.push(child)
			}
			for (const position of deletes) await tx.any.delete(widen(added[position]))
			for (const { ref, attributes } of updates) await tx.update(ref, { attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
