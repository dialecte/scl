import { writeProvenance } from './write-provenance'

import { describe, expect } from 'vitest'

import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { getProvenance } from '@/v2019C1/extensions/reference/query/provenance/get-provenance'
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
	checkClassification?: boolean
	checkProvenance?: boolean
}

describe('writeProvenance with an IED anchor', () => {
	const id = CUSTOM_RECORD_ID_ATTRIBUTE
	const ns = ALL_XMLNS_NAMESPACES

	const testCases: SclTest.TestCases<TestCase> = {
		'IED without source files -> supplied source version recorded': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED already listing that exact version -> unchanged without a duplicate': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-exact" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="B"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: false,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED listing an older revision -> new revision appended after it': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-older" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="A"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="A"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED listing another file -> existing entry retained before new entry': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-other" fileType="SSD" fileName="original.ssd" fileUuid="22222222-2222-4222-8222-222222222222" version="9" revision="Z"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="SSD"][@fileName="original.ssd"][@fileUuid="22222222-2222-4222-8222-222222222222"][@version="9"][@revision="Z"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED listing another file UUID at the same type/version/revision -> new file appended': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-other-uuid" fileType="ISD" fileName="source" fileUuid="22222222-2222-4222-8222-222222222222" version="2" revision="B"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="22222222-2222-4222-8222-222222222222"][@version="2"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED listing the same file/type/revision at another version -> new version appended': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-other-version" fileType="ISD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="1" revision="B"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="1"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED listing the same file/version/revision at another file type -> supplied type appended': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({
				references: /* xml */ `<SclFileReference ${id}="recorded-other-type" fileType="SSD" fileName="source" fileUuid="11111111-1111-4111-8111-111111111111" version="2" revision="B"/>`,
			}),
			fileType: 'ISD',
			expectedChanged: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[1][@fileType="SSD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles/default:SclFileReference[2][@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'SSD source -> explicit source type preserved and specification classification unchanged': {
			sourceXml: sourceDocument({ fileType: 'SSD' }),
			targetXml: targetDocument({}),
			fileType: 'SSD',
			expectedChanged: true,
			checkClassification: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'SCD source -> explicit source type preserved and specification classification unchanged': {
			sourceXml: sourceDocument({ fileType: 'SCD' }),
			targetXml: targetDocument({}),
			fileType: 'SCD',
			expectedChanged: true,
			checkClassification: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
		'IED reference written -> getProvenance returns the exact IED anchor': {
			sourceXml: sourceDocument({ fileType: 'ISD' }),
			targetXml: targetDocument({}),
			fileType: 'ISD',
			expectedChanged: true,
			checkProvenance: true,
			expectedQueries: [
				'/default:SCL/default:IED[@name="TargetIED"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="source"][@fileUuid="11111111-1111-4111-8111-111111111111"][@version="2"][@revision="B"]',
			],
		},
	}

	function sourceDocument(params: { fileType: SclFileType }): string {
		return /* xml */ `
			<SCL ${ns} ${id}="source-root" version="2007" revision="C" release="5">
				<Header ${id}="source-header" id="source-header" uuid="11111111-1111-4111-8111-111111111111" fileType="${params.fileType}" version="2" revision="B"/>
				<IED ${id}="source-ied" name="SourceIED" uuid="33333333-3333-4333-8333-333333333333">
					<AccessPoint ${id}="source-access-point" name="AP1"/>
				</IED>
			</SCL>
		`
	}

	function targetDocument(params: { references?: string }): string {
		const sourceFiles = params.references
			? /* xml */ `<IEDSourceFiles ${id}="target-source-files">${params.references}</IEDSourceFiles>`
			: '<!-- No IEDSourceFiles yet. -->'
		return /* xml */ `
			<SCL ${ns} ${id}="target-root" version="2007" revision="C" release="5">
				<Header ${id}="target-header" id="target-header" uuid="44444444-4444-4444-8444-444444444444" version="7" revision="C"/>
				<IED ${id}="other-ied" name="OtherIED" uuid="55555555-5555-4555-8555-555555555555">
					<AccessPoint ${id}="other-access-point" name="AP1"/>
				</IED>
				<IED ${id}="target-ied" name="TargetIED" uuid="66666666-6666-4666-8666-666666666666">
					<AccessPoint ${id}="target-access-point" name="AP1"/>
					${sourceFiles}
				</IED>
			</SCL>
		`
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target document is required')
		const sourceBefore = await source.query.getTree({ tagName: 'SCL' })
		const targetBefore = await target.query.getTree({ tagName: 'SCL' })
		const classificationsBefore = await classifyIeds(target.query)

		await expect(
			target.transaction(async function recordIedProvenance(tx) {
				return writeProvenance(tx, {
					sourceQuery: source.query,
					target: {
						anchor: 'ied',
						root: { tagName: 'IED', id: 'target-ied' },
						fileType: testCase.fileType,
					},
				})
			}),
		).resolves.toEqual({ changed: testCase.expectedChanged })

		const sourceAfter = await source.query.getTree({ tagName: 'SCL' })
		expect(sourceAfter).toEqual(sourceBefore)
		if (!testCase.expectedChanged) {
			const targetAfter = await target.query.getTree({ tagName: 'SCL' })
			expect(targetAfter).toEqual(targetBefore)
		}
		if (testCase.checkClassification) {
			expect(classificationsBefore).toEqual([
				{
					ied: { tagName: 'IED', id: 'other-ied' },
					name: 'OtherIED',
					kind: 'specification',
					basis: 'no-provenance',
				},
				{
					ied: { tagName: 'IED', id: 'target-ied' },
					name: 'TargetIED',
					kind: 'specification',
					basis: 'no-provenance',
				},
			])
			const classificationsAfter = await classifyIeds(target.query)
			expect(classificationsAfter).toEqual(classificationsBefore)
		}
		if (testCase.checkProvenance) {
			const provenance = await getProvenance(target.query)
			expect(provenance).toEqual([
				{
					fileType: 'ISD',
					fileName: 'source',
					fileUuid: '11111111-1111-4111-8111-111111111111',
					version: '2',
					revision: 'B',
					anchor: { kind: 'ied', ref: { tagName: 'IED', id: 'target-ied' } },
				},
			])
		}

		const containers = await target.query.getRecordsByTagName('IEDSourceFiles')
		expect(containers).toHaveLength(1)
		const ownContainers = await target.query.getChildren(
			{ tagName: 'IED', id: 'target-ied' },
			'IEDSourceFiles',
		)
		expect(ownContainers).toEqual(containers)
		const header = await target.query.getTree({ tagName: 'Header', id: 'target-header' })
		expect(header).toEqual(targetBefore?.tree.find((record) => record.tagName === 'Header'))
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
