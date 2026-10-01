import { describe } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** PTOC1 is what the LNode is mapped to, GGIO1 another logical node, PTOC2 a rebind target. */
const VENDOR_IED = /* xml */ `
	<IED ${id}="ied" name="VENDOR">
		<AccessPoint ${id}="ap" name="AP1">
			<Server ${id}="srv">
				<LDevice ${id}="ld" inst="LD0">
					<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
					<LN ${id}="ggio1" lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="ggio1-uuid"/>
					<LN ${id}="ptoc2" lnClass="PTOC" inst="2" lnType="PTOC_T" uuid="ptoc2-uuid"/>
				</LDevice>
			</Server>
		</AccessPoint>
	</IED>
`

/** An SCL with one LNode mapped to PTOC1 holding `data`. */
function mappedLNode(data: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="sub" name="S1">
				<Function ${id}="fn" name="F1">
					<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
						<Private ${id}="priv" type="eIEC61850-6-100">${data}</Private>
					</LNode>
				</Function>
			</Substation>
			${VENDOR_IED}
		</SCL>
	`
}

/** An SCL with one LNode mapped to nothing (`iedName="None"`) holding `data`. */
function unmappedLNode(data: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="sub" name="S1">
				<Function ${id}="fn" name="F1">
					<LNode ${id}="lnode" iedName="None" lnClass="PSCH" lnInst="1">
						<Private ${id}="priv" type="eIEC61850-6-100">${data}</Private>
					</LNode>
				</Function>
			</Substation>
			${VENDOR_IED}
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	act: (document: Core.Document<Config>) => Promise<void>
}

describe('mapped data attributes on create and update', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'DOS Op set to Op in the LNode logical node -> neither attribute stored': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-op' },
						{ attributes: { mappedDoName: 'Op', mappedLnUuid: 'ptoc1-uuid' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS Mod set to Health in the LNode logical node -> Health and the uuid': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-mod' },
						{ attributes: { mappedDoName: 'Health', mappedLnUuid: 'ptoc1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DOS Op set to Op in another logical node -> the pair, name kept': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-op' },
						{ attributes: { mappedDoName: 'Op', mappedLnUuid: 'ggio1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][@mappedDoName="Op"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'DOS set with an absolute reference and its uuid -> the name from the logical node': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-mod' },
						{
							attributes: {
								mappedDoName: 'VENDOR/LD0/PTOC1.Health',
								mappedLnUuid: 'ptoc1-uuid',
							},
						},
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DOS set with mappedLnUuid of another logical node only -> its own name completed': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-op' },
						{ attributes: { mappedLnUuid: 'ggio1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][@mappedDoName="Op"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'DOS set with its own name only -> nothing stored': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'DOS', id: 'dos-op' }, { attributes: { mappedDoName: 'Op' } })
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS set with another DO name only -> the uuid of the LNode logical node added': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod"/>`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DOS', id: 'dos-mod' },
						{ attributes: { mappedDoName: 'Health' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DAS under a DOS following its default, set to another DO attribute -> DO.da and the uuid': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
					<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAS', id: 'das-general' },
						{ attributes: { mappedDaName: 'Ind2.stVal', mappedLnUuid: 'ptoc1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][not(@mappedDoName)]',
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DAS under a DOS mapped to Health, set to Beh.stVal -> the full path, never the attribute alone':
			{
				sourceXml: mappedLNode(/* xml */ `
					<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
						<eIEC61850-6-100:DAS ${id}="das-stval" name="stVal"/>
					</eIEC61850-6-100:DOS>
				`),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'DAS', id: 'das-stval' },
							{ attributes: { mappedDaName: 'Beh.stVal', mappedLnUuid: 'ptoc1-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:DAS[@name="stVal"][@mappedDaName="Beh.stVal"][@mappedLnUuid="ptoc1-uuid"]',
				],
			},

		'DAS under a DOS mapped to Health, set to Health.q -> nothing stored, it is the default': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
					<eIEC61850-6-100:DAS ${id}="das-q" name="q"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAS', id: 'das-q' },
						{ attributes: { mappedDaName: 'Health.q', mappedLnUuid: 'ptoc1-uuid' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:DAS[@name="q"][not(@mappedDaName)][not(@mappedLnUuid)]'],
		},

		'DOS paired in PTOC1, its DAS set to GGIO1 -> each keeps its own pair': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-str" name="Str" mappedDoName="Str2" mappedLnUuid="ptoc1-uuid">
					<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAS', id: 'das-general' },
						{ attributes: { mappedDaName: 'Ind1.stVal', mappedLnUuid: 'ggio1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Str"][@mappedDoName="Str2"][@mappedLnUuid="ptoc1-uuid"]',
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind1.stVal"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'LNode not mapped, DAS set to another logical node -> the path from that node, not absolute': {
			sourceXml: unmappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
					<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAS', id: 'das-general' },
						{ attributes: { mappedDaName: 'Ind2.stVal', mappedLnUuid: 'ggio1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'DOS created with a pair that repeats its default -> neither attribute stored': {
			sourceXml: mappedLNode(''),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'LNode', id: 'lnode' },
						{
							tagName: 'DOS',
							namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
							attributes: { name: 'Op', mappedDoName: 'Op', mappedLnUuid: 'ptoc1-uuid' },
						},
					)
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS created directly under the LNode with a deviation -> wrapped in a Private, pair kept': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<!-- no Private yet -->
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid"/>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'LNode', id: 'lnode' },
						{
							tagName: 'DOS',
							namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
							attributes: {
								name: 'Mod',
								mappedDoName: 'VENDOR/LD0/PTOC1.Health',
								mappedLnUuid: 'ptoc1-uuid',
							},
						},
					)
				})
			},
			expectedQueries: [
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
			unexpectedQueries: ['//default:LNode/v2019C1:DOS'],
		},

		'DAS set with an absolute reference without uuid -> the path from that node and its uuid': {
			sourceXml: unmappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
					<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'DAS', id: 'das-general' },
						{ attributes: { mappedDaName: 'VENDOR/LD0/GGIO1.Ind2.stVal' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		// ── Cascades: a change above a record changes its default ───────────

		'DOS and DAS stamped with the LNode uuid, DOS set to Health -> the DAS stamp removed, it follows Health':
			{
				sourceXml: mappedLNode(/* xml */ `
					<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedLnUuid="ptoc1-uuid">
						<eIEC61850-6-100:DAS ${id}="das-ctl" name="ctlModel" mappedLnUuid="ptoc1-uuid"/>
					</eIEC61850-6-100:DOS>
				`),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'DOS', id: 'dos-mod' },
							{ attributes: { mappedDoName: 'Health', mappedLnUuid: 'ptoc1-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
					'//v2019C1:DAS[@name="ctlModel"][not(@mappedDaName)][not(@mappedLnUuid)]',
				],
			},

		'LNode rebound to PTOC2 -> a DOS with its own pair keeps it, one without follows': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid"/>
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'LNode', id: 'lnode' },
						{ attributes: { lnUuid: 'ptoc2-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
				'//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]',
			],
		},

		'LNode rebound to the logical node a DOS pair names, same path -> that pair removed': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Op" mappedLnUuid="ggio1-uuid"/>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'LNode', id: 'lnode' },
						{ attributes: { lnUuid: 'ggio1-uuid' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'LNode unbound -> a DOS with its own pair keeps it': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Op" mappedLnUuid="ggio1-uuid"/>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode' }, { attributes: { lnUuid: undefined } })
				})
			},
			expectedQueries: [
				'//default:LNode[@iedName="None"]',
				'//v2019C1:DOS[@name="Op"][@mappedDoName="Op"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'LNode without lnUuid renamed to the logical node a DOS pair names -> that pair removed': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="sub" name="S1">
						<Function ${id}="fn" name="F1">
							<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1">
								<Private ${id}="priv" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Op" mappedLnUuid="ggio1-uuid"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					${VENDOR_IED}
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'LNode', id: 'lnode' }, { attributes: { lnClass: 'GGIO' } })
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS remapped from Health to Beh -> a DAS pair elsewhere kept, a DAS pair now default removed':
			{
				sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
					<eIEC61850-6-100:DAS ${id}="das-stval" name="stVal" mappedDaName="Ind2.stVal" mappedLnUuid="ptoc1-uuid"/>
					<eIEC61850-6-100:DAS ${id}="das-q" name="q" mappedDaName="Beh.q" mappedLnUuid="ptoc1-uuid"/>
				</eIEC61850-6-100:DOS>
			`),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'DOS', id: 'dos-mod' },
							{ attributes: { mappedDoName: 'Beh', mappedLnUuid: 'ptoc1-uuid' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:DAS[@name="stVal"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ptoc1-uuid"]',
					'//v2019C1:DAS[@name="q"][not(@mappedDaName)][not(@mappedLnUuid)]',
				],
			},

		'DOS renamed so that its pair is now its default -> pair removed': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid"/>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'DOS', id: 'dos-mod' }, { attributes: { name: 'Health' } })
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Health"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS set with an absolute reference to a logical node absent from the file -> left as written':
			{
				sourceXml: unmappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
				act: async (document) => {
					await document.transaction(async (tx) => {
						await tx.update(
							{ tagName: 'DOS', id: 'dos-op' },
							{ attributes: { mappedDoName: 'OTHER/LD0/GGIO9.Ind2' } },
						)
					})
				},
				expectedQueries: [
					'//v2019C1:DOS[@name="Op"][@mappedDoName="OTHER/LD0/GGIO9.Ind2"][not(@mappedLnUuid)]',
				],
			},

		'logical node a DOS pair names deleted -> both attributes removed, never one': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Ind2" mappedLnUuid="ggio1-uuid"/>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'LN', id: 'ggio1' })
				})
			},
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'SDS standing for an attribute structure set to Pos.Oper -> left as written': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-pos" name="Pos">
					<eIEC61850-6-100:SDS ${id}="sds-sbow" name="SBOw"/>
				</eIEC61850-6-100:DOS>
			`),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SDS', id: 'sds-sbow' },
						{ attributes: { mappedDoName: 'Pos.Oper', mappedLnUuid: 'ptoc1-uuid' } },
					)
				})
			},
			expectedQueries: [
				'//v2019C1:SDS[@name="SBOw"][@mappedDoName="Pos.Oper"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})
