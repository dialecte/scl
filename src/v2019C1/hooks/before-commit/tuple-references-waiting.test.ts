import breakersAndASubscriber from './fixtures/breakers-and-a-subscriber.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type Added = {
	parent: Scl.Ref<Scl.ElementsOf>
	tagName: string
	attributes: Record<string, string>
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const IED7_DATA_SET = { tagName: 'DataSet', id: 'ds7' } as Scl.Ref<Scl.ElementsOf>
const IED8_INPUTS = { tagName: 'Inputs', id: 'in8' } as Scl.Ref<Scl.ElementsOf>
const ENTRY_FOR_XCBR1 = {
	ldInst: 'LD1',
	lnClass: 'XCBR',
	lnInst: '1',
	doName: 'Pos',
	daName: 'stVal',
	fc: 'ST',
}

describe('a later rename binds a reference by names only when its names come to name what they did not', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		added: Added
		renamed: { element: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set gets an entry for its XCBR1 by names (left unbound); a later transaction renames IED7's access point
		'an entry naming a logical node that was there, its access point renamed later → still no uuid':
			{
				sourceXml: breakersAndASubscriber,
				added: { parent: IED7_DATA_SET, tagName: 'FCDA', attributes: ENTRY_FOR_XCBR1 },
				renamed: {
					element: { tagName: 'AccessPoint', id: 'ap7' } as Scl.Ref<Scl.ElementsOf>,
					attributes: { name: 'AP3' },
				},
				expectedQueries: ['//default:FCDA[@lnInst="1"][not(@lnUuid)]'],
			},
		// the same entry, which names its IED by where it sits; a later transaction renames IED7 to IED9
		'an entry naming a logical node of its own IED, that IED renamed later → still no uuid': {
			sourceXml: breakersAndASubscriber,
			added: { parent: IED7_DATA_SET, tagName: 'FCDA', attributes: ENTRY_FOR_XCBR1 },
			renamed: {
				element: { tagName: 'IED', id: 'ied7' } as Scl.Ref<Scl.ElementsOf>,
				attributes: { name: 'IED9' },
			},
			expectedQueries: ['//default:FCDA[@lnInst="1"][not(@lnUuid)]'],
		},
		// IED8's inputs get an input naming IED9's XCBR1, which no IED holds; a later transaction renames IED7 to IED9
		'an input naming an IED nothing holds, an IED renamed to it later → its lnUuid written then': {
			sourceXml: breakersAndASubscriber,
			added: {
				parent: IED8_INPUTS,
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED9',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '1',
					doName: 'Pos',
					intAddr: 'later',
				},
			},
			renamed: {
				element: { tagName: 'IED', id: 'ied7' } as Scl.Ref<Scl.ElementsOf>,
				attributes: { name: 'IED9' },
			},
			expectedQueries: ['//default:ExtRef[@intAddr="later"][@iedName="IED9"][@lnUuid="xcbr1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(testCase.added.parent, {
				tagName: testCase.added.tagName,
				attributes: testCase.added.attributes,
			})
		})
		await source.transaction(async function rename(tx) {
			await tx.any.update(testCase.renamed.element, { attributes: testCase.renamed.attributes })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// IED7 holds two access points; LD1 (its data set DS and XCBR1) and LD2 (no breaker) sit in the first one's server
const TWO_DEVICES = /* xml */ `
	<SCL ${ns} ${id}="root">
		<IED name="IED7" uuid="ied7" ${id}="ied7">
			<AccessPoint name="AP1" uuid="ap71" ${id}="ap71">
				<Server ${id}="srv71">
					<Authentication ${id}="auth71"/>
					<LDevice inst="LD1" uuid="ld1" ${id}="ld1">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln01" ${id}="ln01">
							<DataSet name="DS" ${id}="ds1"/>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr1" ${id}="xcbr1"/>
					</LDevice>
					<LDevice inst="LD2" uuid="ld2" ${id}="ld2">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln02" ${id}="ln02"/>
					</LDevice>
				</Server>
			</AccessPoint>
			<AccessPoint name="AP2" uuid="ap72" ${id}="ap72">
				<Server ${id}="srv72">
					<Authentication ${id}="auth72"/>
					<LDevice inst="LD3" uuid="ld3" ${id}="ld3">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln03" ${id}="ln03"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1"><DO name="Pos" type="DPC_T" ${id}="do-pos"/></LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dot"><DA name="stVal" fc="ST" bType="Dbpos" ${id}="da-st"/></DOType>
		</DataTypeTemplates>
	</SCL>
`

describe('a later move binds a reference by names only when its names come to name what they did not', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		moved: { element: Scl.Ref<Scl.ElementsOf>; parent: Scl.Ref<Scl.ElementsOf> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// LD1's data set gets an entry for LD2's XCBR1, which LD2 lacks; a later transaction moves XCBR1 into LD2
		'an entry naming a logical node nothing holds, a logical node moved to it later → its lnUuid written then':
			{
				sourceXml: TWO_DEVICES,
				entry: { ...ENTRY_FOR_XCBR1, ldInst: 'LD2' },
				moved: {
					element: { tagName: 'LN', id: 'xcbr1' } as Scl.Ref<Scl.ElementsOf>,
					parent: { tagName: 'LDevice', id: 'ld2' } as Scl.Ref<Scl.ElementsOf>,
				},
				expectedQueries: ['//default:FCDA[@ldInst="LD2"][@lnUuid="xcbr1"]'],
			},
		// LD1's data set gets an entry for its XCBR1 by names (left unbound); a later transaction moves LD1 to AP2's server
		'an entry naming a logical node that was there, its device moved to another access point later → still no uuid':
			{
				sourceXml: TWO_DEVICES,
				entry: ENTRY_FOR_XCBR1,
				moved: {
					element: { tagName: 'LDevice', id: 'ld1' } as Scl.Ref<Scl.ElementsOf>,
					parent: { tagName: 'Server', id: 'srv72' } as Scl.Ref<Scl.ElementsOf>,
				},
				expectedQueries: ['//default:FCDA[@ldInst="LD1"][not(@lnUuid)]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntry(tx) {
			await tx.any.addChild({ tagName: 'DataSet', id: 'ds1' } as Scl.Ref<Scl.ElementsOf>, {
				tagName: 'FCDA',
				attributes: testCase.entry,
			})
		})
		await source.transaction(async function move(tx) {
			await tx.any.move(testCase.moved.element, { parent: testCase.moved.parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a move into an element the same transaction creates binds only names that did not name the moved element', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		entry: Record<string, string>
		device: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// LD1's data set gets an entry for LD1's XCBR1 by names (left unbound); a later transaction renames LD1 to LDX,
		// creates a new LD1 and moves XCBR1 into it: the entry's names name XCBR1 before and after
		'an entry naming a logical node that was there, moved into a device created under its old name → still no uuid':
			{
				sourceXml: TWO_DEVICES,
				entry: ENTRY_FOR_XCBR1,
				device: { inst: 'LD1', uuid: 'ld-new' },
				expectedQueries: ['//default:FCDA[@ldInst="LD1"][not(@lnUuid)]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addEntry(tx) {
			await tx.any.addChild({ tagName: 'DataSet', id: 'ds1' } as Scl.Ref<Scl.ElementsOf>, {
				tagName: 'FCDA',
				attributes: testCase.entry,
			})
		})
		await source.transaction(async function moveIntoNewDevice(tx) {
			await tx.any.update({ tagName: 'LDevice', id: 'ld1' } as Scl.Ref<Scl.ElementsOf>, {
				attributes: { inst: 'LDX' },
			})
			const device = await tx.any.addChild(
				{ tagName: 'Server', id: 'srv71' } as Scl.Ref<Scl.ElementsOf>,
				{
					tagName: 'LDevice',
					attributes: testCase.device,
				},
			)
			await tx.any.addChild(device, {
				tagName: 'LN0',
				attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T', uuid: 'ln0-new' },
			})
			await tx.any.move({ tagName: 'LN', id: 'xcbr1' } as Scl.Ref<Scl.ElementsOf>, {
				parent: device,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
