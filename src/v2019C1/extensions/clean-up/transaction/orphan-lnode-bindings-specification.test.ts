import { resetLNodes } from './orphan-lnode-bindings'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * An LNode bound to a logical node the document does not hold (its real IED gone), specified on S1's CILO1 in CTRL.
 * S1 is a specification IED holding CILO1; R2 is a real IED holding the same naming.
 */
const boundToAMissingLogicalNode = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="R1" ldInst="LD0" lnClass="CILO" lnInst="4" lnUuid="gone-uuid" uuid="lnode-uuid">
					<Private ${id}="lnode-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-naming" sIedName="S1" sLdInst="CTRL" sLnClass="CILO" sLnInst="1"/>
					</Private>
				</LNode>
				<LNode ${id}="lnode-on-r2" iedName="R1" ldInst="LD0" lnClass="CILO" lnInst="4" lnUuid="gone-uuid" uuid="lnode-on-r2-uuid">
					<Private ${id}="lnode-on-r2-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-on-r2-naming" sIedName="R2" sLdInst="CTRL" sLnClass="CILO" sLnInst="1"/>
					</Private>
				</LNode>
			</Function>
		</Substation>
		<IED ${id}="s1" name="S1">
			<AccessPoint ${id}="s1-ap" name="AP1"><Server ${id}="s1-server"><LDevice ${id}="s1-ld" inst="CTRL">
				<LN ${id}="s1-cilo" prefix="" lnClass="CILO" inst="1" lnType="CILO_T" uuid="s1-cilo-uuid"/>
			</LDevice></Server></AccessPoint>
		</IED>
		<IED ${id}="r2" name="R2">
			<IEDSourceFiles ${id}="r2-source-files"><SclFileReference ${id}="r2-icd" fileType="ICD"/></IEDSourceFiles>
			<AccessPoint ${id}="r2-ap" name="AP1"><Server ${id}="r2-server"><LDevice ${id}="r2-ld" inst="CTRL">
				<LN ${id}="r2-cilo" prefix="" lnClass="CILO" inst="1" lnType="CILO_T" uuid="r2-cilo-uuid"/>
			</LDevice></Server></AccessPoint>
		</IED>
	</SCL>
`

/**
 * The same LNode bound to a missing logical node and specified on S1's CILO1, while another LNode is bound to CILO1:
 * one logical node implements one LNode.
 */
const specifiedLogicalNodeTaken = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1">
				<LNode ${id}="lnode" iedName="R1" ldInst="LD0" lnClass="CILO" lnInst="4" lnUuid="gone-uuid" uuid="lnode-uuid">
					<Private ${id}="lnode-private" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="lnode-naming" sIedName="S1" sLdInst="CTRL" sLnClass="CILO" sLnInst="1"/>
					</Private>
				</LNode>
				<LNode ${id}="lnode-on-s1" iedName="S1" ldInst="CTRL" prefix="" lnClass="CILO" lnInst="1" lnUuid="s1-cilo-uuid" uuid="lnode-on-s1-uuid"/>
			</Function>
		</Substation>
		<IED ${id}="s1" name="S1">
			<AccessPoint ${id}="s1-ap" name="AP1"><Server ${id}="s1-server"><LDevice ${id}="s1-ld" inst="CTRL">
				<LN ${id}="s1-cilo" prefix="" lnClass="CILO" inst="1" lnType="CILO_T" uuid="s1-cilo-uuid"/>
			</LDevice></Server></AccessPoint>
		</IED>
	</SCL>
`

describe('resetLNodes releases an LNode to the specification IED it is specified on', () => {
	const testCases: SclTest.TestCases = {
		'an LNode bound to a missing logical node, specified on a specification IED holding its logical node -> bound to that logical node':
			{
				sourceXml: boundToAMissingLogicalNode,
				allowIncoherentReferences:
					'the LNode names a logical node the document lacks: what the reset releases',
				expectedQueries: [
					'//default:LNode[@uuid="lnode-uuid"][@iedName="S1"][@ldInst="CTRL"][@lnClass="CILO"][@lnInst="1"][@lnUuid="s1-cilo-uuid"]',
				],
			},

		'an LNode bound to a missing logical node, its specified naming naming a real IED -> on no IED':
			{
				sourceXml: boundToAMissingLogicalNode,
				allowIncoherentReferences:
					'the LNode names a logical node the document lacks: what the reset releases',
				expectedQueries: [
					'//default:LNode[@uuid="lnode-on-r2-uuid"][@iedName="None"][not(@lnUuid)]',
				],
			},

		'an LNode bound to a missing logical node, specified on a logical node another LNode is bound to -> on no IED':
			{
				sourceXml: specifiedLogicalNodeTaken,
				allowIncoherentReferences:
					'the LNode names a logical node the document lacks: what the reset releases',
				expectedQueries: [
					'//default:LNode[@uuid="lnode-uuid"][@iedName="None"][not(@lnUuid)]',
					'//default:LNode[@uuid="lnode-on-s1-uuid"][@iedName="S1"][@lnUuid="s1-cilo-uuid"]',
				],
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
