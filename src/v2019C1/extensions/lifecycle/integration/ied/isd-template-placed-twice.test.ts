/// <reference types="vite/client" />

import AOnOneBayWithLineageAndProvenanceXml from '../../extract/transaction/fixtures/a-on-one-bay-with-lineage-and-provenance.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, openSclDocument, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const ns = ALL_XMLNS_NAMESPACES

/** A project of one substation and one voltage level, no bay, no IED. */
const projectNorthXml = /* xml */ `
	<SCL ${ns}>
		<Header id="North" fileType="SSD" uuid="f0000000-0000-4000-8000-000000000020" version="1" revision="A"/>
		<Substation name="North" uuid="b0000000-0000-4000-8000-000000000001">
			<VoltageLevel name="E1" uuid="b0000000-0000-4000-8000-000000000002"/>
		</Substation>
	</SCL>
`

const emptyIsdXml = /* xml */ `<SCL ${ns}/>`

/**
 * An ISD template serves every device of a frame agreement: extracted from one project, it is placed in another as many
 * times as devices are bought, each placement a device of its own with its own bay.
 */
describe('extract.ied as a template, instantiated twice', () => {
	const testCases: SclTest.TestCases = {
		// the fixture: A's LNodes in one bay of one substation, A on N1; the project: one substation and voltage level, no bay
		'A extracted as a template, placed twice as BCU_A and BCU_B → two IEDs, two bays, each LNode bound to its own IED':
			{
				sourceXml: AOnOneBayWithLineageAndProvenanceXml,
				targetXml: projectNorthXml,
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU_A"][@templateUuid=/default:SCL/default:IED[@name="BCU_B"]/@templateUuid][@uuid!=/default:SCL/default:IED[@name="BCU_B"]/@uuid]',
					'/default:SCL/default:Substation[@name="North"]/default:VoltageLevel[@name="E1"][count(default:Bay)=2]',
					'//default:Bay/default:Function[@name="F1"]/default:LNode[@lnClass="PTRC"][@iedName="BCU_A"][@lnUuid=//default:IED[@name="BCU_A"]//default:LN[@lnClass="PTRC"]/@uuid]',
					'//default:Bay/default:Function[@name="F1"]/default:LNode[@lnClass="PTRC"][@iedName="BCU_B"][@lnUuid=//default:IED[@name="BCU_B"]//default:LN[@lnClass="PTRC"]/@uuid]',
					'//default:Communication/default:SubNetwork[@name="N1"][default:ConnectedAP[@iedName="BCU_A"]][default:ConnectedAP[@iedName="BCU_B"]]',
				],
				unexpectedQueries: [
					'//default:IED[@name="SPECIFICATION"]',
					'//default:Substation[@name="TEMPLATE"]',
					'//*[@iedName="SPECIFICATION"]',
				],
			},
	}

	async function act({
		source,
		target,
		project,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const isd = await openSclDocument({ project, xml: emptyIsdXml, label: 'template isd' })
		await isd.transaction(async function exportTemplate(tx) {
			await tx.lifecycle.extract.ied({
				sourceQuery: source.query,
				iedRef: { tagName: 'IED', id: 'ied-a' },
				fileType: 'ISD',
				kind: 'template',
				inputs: 'none',
				issuer: 'TEST_ISSUER',
				tool: 'TEST',
				who: 'engineer',
			})
		})
		const [ied] = await isd.query.getRecordsByTagName('IED')
		if (!ied) throw new Error('the template holds no IED')
		const root = await target.query.getRoot()
		for (const name of ['BCU_A', 'BCU_B']) {
			await target.transaction(async function placeDevice(tx) {
				// dialecte-allow act-repeats-call: a frame agreement template is placed once per device bought, the behaviour is the second placement beside the first
				await tx.lifecycle.instantiate.ied({
					sourceQuery: isd.query,
					iedRef: { tagName: 'IED', id: ied.id },
					anchor: { tagName: 'SCL', id: root.id },
					fileType: 'ISD',
					overrides: new Map([[ied.id, { name }]]),
				})
			})
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
