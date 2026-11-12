import { writeProvenance } from './write-provenance'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclFileType } from './write-provenance.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	fileType: SclFileType
	expectedChanged: boolean
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const SOURCE_ISD = /* xml */ `
	<SCL ${ns} ${id}="source-root" version="2007" revision="C" release="5">
		<Header ${id}="source-header" id="source-header" uuid="11111111-1111-4111-8111-111111111111" fileType="ISD" version="2" revision="B"/>
		<IED ${id}="source-ied" name="SourceIED" uuid="33333333-3333-4333-8333-333333333333">
			<AccessPoint ${id}="source-access-point" name="AP1"/>
		</IED>
	</SCL>
`

const SOURCE_SSD = /* xml */ `
	<SCL ${ns} ${id}="source-root" version="2007" revision="C" release="5">
		<Header ${id}="source-header" id="source-header" uuid="11111111-1111-4111-8111-111111111111" fileType="SSD" version="2" revision="B"/>
		<IED ${id}="source-ied" name="SourceIED" uuid="33333333-3333-4333-8333-333333333333">
			<AccessPoint ${id}="source-access-point" name="AP1"/>
		</IED>
	</SCL>
`

const SOURCE_SCD = /* xml */ `
	<SCL ${ns} ${id}="source-root" version="2007" revision="C" release="5">
		<Header ${id}="source-header" id="source-header" uuid="11111111-1111-4111-8111-111111111111" fileType="SCD" version="2" revision="B"/>
		<IED ${id}="source-ied" name="SourceIED" uuid="33333333-3333-4333-8333-333333333333">
			<AccessPoint ${id}="source-access-point" name="AP1"/>
		</IED>
	</SCL>
`

/** What an IED anchor leaves as it was: one source files list in the file, the Header without references. */
const TARGET_KEPT = [
	'/default:SCL[count(.//default:IEDSourceFiles)=1]',
	'/default:SCL/default:Header[@id="target-header"][@uuid="44444444-4444-4444-8444-444444444444"][@version="7"][@revision="C"][not(*)]',
]

describe('writeProvenance with an IED anchor', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'IED without source files -> supplied source version recorded': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<!-- no IEDSourceFiles yet -->
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED already listing that exact version -> unchanged without a duplicate': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-exact" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="B"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: false,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED listing an older revision -> new revision appended after it': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-older" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="A"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="A"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED listing another file -> existing entry retained before new entry': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-other" fileType="SSD" fileName="original.ssd" fileUuid="22222222-2222-4222-8222-222222222222" version="9" revision="Z"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="SSD"][@fileName="original.ssd"][@fileUuid="22222222-2222-4222-8222-222222222222"][@version="9"][@revision="Z"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED listing another file UUID at the same type/version/revision -> new file appended': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-other-uuid" fileType="ISD" fileName="source" fileUuid="22222222-2222-4222-8222-222222222222" version="2" revision="B"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="22222222-2222-4222-8222-222222222222"][@version="2"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED listing the same file/type/revision at another version -> new version appended': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-other-version" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="1" revision="B"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="1"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'IED listing the same file/version/revision at another file type -> supplied type appended': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<IEDSourceFiles ${id}="target-source-files">
							<SclFileReference ${id}="recorded-other-type" fileType="SSD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="B"/>
						</IEDSourceFiles>
					</IED>
				</SCL>
			`,
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="SSD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'SSD source -> explicit source type preserved': {
			sourceXml: SOURCE_SSD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<!-- no IEDSourceFiles yet -->
					</IED>
				</SCL>
			`,
			fileType: 'SSD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
		'SCD source -> explicit source type preserved': {
			sourceXml: SOURCE_SCD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<!-- no IEDSourceFiles yet -->
					</IED>
				</SCL>
			`,
			fileType: 'SCD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="source.xml"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				...TARGET_KEPT,
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target document is required')
		const result = await target.transaction(async function recordIedProvenance(tx) {
			return writeProvenance(tx, {
				sourceQuery: source.query,
				target: {
					anchor: 'ied',
					root: { tagName: 'IED', id: 'target-ied' },
					fileType: testCase.fileType,
				},
			})
		})
		expect(result).toEqual({ changed: testCase.expectedChanged })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('writeProvenance with an IED anchor reads its source only', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'IED reference written from an ISD source → the source as it was': {
			sourceXml: SOURCE_ISD,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
					<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
					<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
						<AccessPoint ${id}="other-access-point" name="AP1"/>
					</IED>
					<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
						<AccessPoint ${id}="target-access-point" name="AP1"/>
						<!-- no IEDSourceFiles yet -->
					</IED>
				</SCL>
			`,
			expectedQueries: [
				'/default:SCL[count(*)=2]/default:Header[@id="source-header"][@uuid="11111111-1111-4111-8111-111111111111"][@fileType="ISD"][@version="2"][@revision="B"][not(*)]',
				'/default:SCL/default:IED[@name="SourceIED"][count(*)=1]/default:AccessPoint[@name="AP1"][not(*)]',
			],
		},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target document is required')
		await target.transaction(async function recordIedProvenance(tx) {
			return writeProvenance(tx, {
				sourceQuery: source.query,
				target: { anchor: 'ied', root: { tagName: 'IED', id: 'target-ied' }, fileType: 'ISD' },
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
