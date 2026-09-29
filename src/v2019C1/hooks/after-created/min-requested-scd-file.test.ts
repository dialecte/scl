import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl, Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectUuid = '11111111-2222-3333-4444-555555555555'
const otherProjectUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('afterCreated — MinRequestedSCDFile', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef created in an IED without entry → wrapper and project entry created from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
					<IED ${id}="protection" name="Protection">
						<AccessPoint ${id}="protection-access-point" name="AP1">
							<Server ${id}="protection-server">
								<Authentication ${id}="protection-authentication" />
								<LDevice ${id}="protection-ldevice" inst="LD1">
									<LN0 ${id}="protection-ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
										<Inputs ${id}="protection-inputs" />
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
						<!-- no MinRequestedSCDFiles -->
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'Inputs', id: 'protection-inputs' },
						{ tagName: 'ExtRef', attributes: { intAddr: 'input1' } },
					)
				})
			},
			expectedQueries: [
				`//default:IED[@name="Protection"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileType="SCD"][@fileUuid="${projectUuid}"][@version="2"][@revision="B"]`,
			],
		},

		'Text created in an IED → not a trigger, no entry written': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
					<IED ${id}="protection" name="Protection">
						<AccessPoint ${id}="protection-access-point" name="AP1" />
						<!-- no MinRequestedSCDFiles -->
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild({ tagName: 'IED', id: 'protection' }, { tagName: 'Text' })
				})
			},
			unexpectedQueries: ['//default:MinRequestedSCDFiles'],
		},

		'IED listing the project cloned in → one wrapper, project entry synced with its file name': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
					<IED ${id}="protection" name="Protection">
						<AccessPoint ${id}="protection-access-point" name="AP1">
							<Server ${id}="protection-server">
								<Authentication ${id}="protection-authentication" />
								<LDevice ${id}="protection-ldevice" inst="LD1">
									<LN0 ${id}="protection-ln0" lnClass="LLN0" inst="" lnType="LLN0Type">
										<DataSet ${id}="protection-dataset" name="DS1" />
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
						<MinRequestedSCDFiles ${id}="protection-wrapper">
							<MinRequestedSCDFile ${id}="protection-project-entry" fileType="SCD" fileUuid="${projectUuid}" version="1" revision="A" fileName="protection.scd" />
							<MinRequestedSCDFile ${id}="protection-other-project-entry" fileType="SCD" fileUuid="${otherProjectUuid}" version="9" revision="Z" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					const tree = await tx.getTree({ tagName: 'IED', id: 'protection' })
					const clone = await tx.deepClone(
						{ tagName: 'SCL', id: 'root' },
						tree as Scl.TreeRecord<'IED'>,
					)
					await tx.update(clone.record, { attributes: { name: 'ProtectionCopy' } })
				})
			},
			expectedQueries: [
				`//default:IED[@name="ProtectionCopy"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${projectUuid}"][@version="2"][@revision="B"][@fileName="protection.scd"]`,
				`//default:IED[@name="ProtectionCopy"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${otherProjectUuid}"][@version="9"]`,
			],
			unexpectedQueries: [
				'//default:IED[@name="ProtectionCopy"]/default:MinRequestedSCDFiles[2]',
				`//default:IED[@name="ProtectionCopy"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${projectUuid}"][2]`,
			],
		},

		'second wrapper added under an IED → one wrapper holding every entry': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
					<IED ${id}="protection" name="Protection">
						<AccessPoint ${id}="protection-access-point" name="AP1" />
						<MinRequestedSCDFiles ${id}="existing-wrapper">
							<MinRequestedSCDFile ${id}="other-project-entry" fileType="SCD" fileUuid="${otherProjectUuid}" version="9" revision="Z" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					const wrapper = await tx.addChild(
						{ tagName: 'IED', id: 'protection' },
						{ tagName: 'MinRequestedSCDFiles' },
					)
					await tx.addChild(wrapper, {
						tagName: 'MinRequestedSCDFile',
						attributes: { fileType: 'SCD', fileUuid: projectUuid, version: '2', revision: 'B' },
					})
				})
			},
			expectedQueries: [
				`//default:IED/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${otherProjectUuid}"]`,
				`//default:IED/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="${projectUuid}"]`,
			],
			unexpectedQueries: ['//default:IED/default:MinRequestedSCDFiles[2]'],
		},

		'entry of a listed project added → folded into the listed entry': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header ${id}="header" id="Project" uuid="${projectUuid}" version="2" revision="B" />
					<IED ${id}="protection" name="Protection">
						<AccessPoint ${id}="protection-access-point" name="AP1" />
						<MinRequestedSCDFiles ${id}="wrapper">
							<MinRequestedSCDFile ${id}="listed-entry" fileType="SCD" fileUuid="${projectUuid}" version="2" revision="B" />
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'MinRequestedSCDFiles', id: 'wrapper' },
						{
							tagName: 'MinRequestedSCDFile',
							attributes: {
								fileType: 'SCD',
								fileUuid: projectUuid,
								version: '1',
								revision: 'A',
								fileName: 'added.scd',
							},
						},
					)
				})
			},
			expectedQueries: [
				`//default:MinRequestedSCDFile[@fileUuid="${projectUuid}"][@version="2"][@fileName="added.scd"]`,
			],
			unexpectedQueries: [
				`//default:MinRequestedSCDFile[@fileUuid="${projectUuid}"][2]`,
				`//default:MinRequestedSCDFile[@version="1"]`,
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
