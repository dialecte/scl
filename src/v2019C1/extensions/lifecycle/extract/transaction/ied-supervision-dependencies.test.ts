import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	collectSclOutputViolations,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'
import { treeEntriesOf } from '@/v2019C1/test/tree-entries'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { TreeEntry } from '@/v2019C1/test/tree-entries.types'
import type { AnyAttribute, AnyTreeRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const nativeNamespace = 'http://www.iec.ch/61850/2003/SCL'
const emptyTarget = /* xml */ `<SCL ${ns}/>`
const controlTags = ['ReportControl', 'GSEControl', 'SampledValueControl', 'LogControl'] as const
const supervisionRef = { tagName: 'FCDA', id: 'supervision-fcda' } as const
const expectedWarnings = [
	{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'omitted-supervision' } },
]

// what every extraction keeps and leaves out, whichever dataset the supervision FCDA sat in
const keptQueries = [
	'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"]',
	'//default:LDevice[@inst="LD1"]/default:LN0/default:DataSet[@name="Untouched"][count(default:FCDA)=1]/default:FCDA[@lnClass="PTOC"][@lnInst="1"][@doName="Status"][@daName="stVal"][@fc="ST"]',
	'//default:Private[@type="vendor.homonyms"]/*[local-name()="LN"][namespace-uri()="urn:supervision-dependencies:test"]/*[local-name()="ReportControl"][@confRev="4294967295"]',
]
const leftOutQueries = [
	'//default:IED[@name="Foreign"]',
	'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
	'//default:FCDA[@lnClass="LGOS" or @lnClass="LSVS"]',
]

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The `datSet` of the affected consumers: absent when their dataset lost its last FCDA and went. */
	expectedDatSet: 'Events' | undefined
	nativeFcdas: number
	nativeDataSets: number
	controlsPerTag: number
	expectedConfRev: string
	rollbackFirst?: boolean
}
type NamesOnlyTestCase = TestCase & { supervisionClass: 'LGOS' | 'LSVS' }
type ExtractParams = {
	act: SclTest.ActParams<TestCase>
	actualSource: SclTest.ActParams<TestCase>['source']
}

function scopedIdentity(entry: TreeEntry): string {
	const scope = entry.ancestors
		.filter(function nativeScope(record) {
			return (
				record.namespace.uri === nativeNamespace &&
				['IED', 'AccessPoint', 'LDevice', 'LN0', 'LN'].includes(record.tagName)
			)
		})
		.map(function scopeSegment(record) {
			const names =
				record.tagName === 'LN' || record.tagName === 'LN0'
					? ['prefix', 'lnClass', 'inst']
					: [record.tagName === 'LDevice' ? 'inst' : 'name']
			return {
				tagName: record.tagName,
				identity: names.map(function value(name) {
					return readAttribute({ record, name })
				}),
			}
		})
	return JSON.stringify([
		...scope,
		{
			tagName: entry.record.tagName,
			name: readAttribute({ record: entry.record, name: 'name' }),
		},
	])
}

function retainedSelectedEntry(entry: TreeEntry): boolean {
	return (
		entry.record.namespace.uri === nativeNamespace &&
		entry.ancestors.some(function selected(record) {
			return (
				record.namespace.uri === nativeNamespace &&
				record.tagName === 'IED' &&
				readAttribute({ record, name: 'name' }) === 'Selected'
			)
		}) &&
		!entry.ancestors.some(function omitted(record) {
			return (
				record.namespace.uri === nativeNamespace &&
				record.tagName === 'LN' &&
				['LGOS', 'LSVS'].includes(readAttribute({ record, name: 'lnClass' }))
			)
		})
	)
}

// Project public snapshot trees onto XML content, excluding only storage metadata and lexical ordering/prefixes.
function semanticSubtree(params: {
	tree: AnyTreeRecord
	attributeOverrides?: Record<string, string | undefined>
}): unknown {
	const { tree, attributeOverrides = {} } = params
	const attributes = tree.attributes
		.filter(function retained(attribute: AnyAttribute) {
			return !(
				!attribute.namespace?.uri &&
				Object.hasOwn(attributeOverrides, attribute.name) &&
				attributeOverrides[attribute.name] === undefined
			)
		})
		.map(function semanticAttribute(attribute: AnyAttribute) {
			return {
				name: attribute.name.split(':').at(-1),
				namespace: attribute.namespace?.uri ?? '',
				value:
					!attribute.namespace?.uri && Object.hasOwn(attributeOverrides, attribute.name)
						? attributeOverrides[attribute.name]
						: attribute.value,
			}
		})
		.sort(function attributeOrder(left, right) {
			return JSON.stringify([left.namespace, left.name]).localeCompare(
				JSON.stringify([right.namespace, right.name]),
			)
		})
	return {
		tagName: tree.tagName.split(':').at(-1),
		namespace: tree.namespace.uri,
		attributes,
		value: tree.value,
		tree: tree.tree.map(function semanticChild(child) {
			return semanticSubtree({ tree: child })
		}),
	}
}

/** The source as the project file `extract.ied` reads: an imported `.scd`, valid before the extraction. */
async function importProjectFile(
	params: SclTest.ActParams<TestCase>,
): Promise<SclTest.ActParams<TestCase>['source']> {
	const { project, source, testCase } = params
	const runnerInfo = await source.query.getDocumentInfo()
	const imported = await project.importFile(
		new File([testCase.sourceXml], 'project.scd', { type: 'text/xml' }),
		{ configKey: runnerInfo.configKey, useCustomRecordsIds: true },
	)
	const actualSource = project.openDocument(imported.documentId)
	const sourceReport = await collectSclOutputViolations({ project, document: actualSource })
	expect(sourceReport.violations).toEqual([])
	const sourceInfo = await actualSource.query.getDocumentInfo()
	expect(sourceInfo.extension).toBe('.scd')
	return actualSource
}

async function extractAndExpect(params: ExtractParams): Promise<SclTest.ActResult> {
	const { act, actualSource } = params
	const { project, target, testCase } = act
	if (!target) throw new Error('target required')
	const extractParams = {
		sourceQuery: actualSource.query,
		iedRef: { tagName: 'IED', id: 'selected-ied' },
		fileType: 'ISD',
		kind: 'instance',
		inputs: 'none',
		issuer: 'TEST_ISSUER',
		tool: 'TEST',
		who: 'test',
	} as const
	const targetBefore = await target.query.getSnapshot({ as: 'xml' })
	const targetInfo = await target.query.getDocumentInfo()
	const targetInfoBefore = structuredClone(targetInfo)
	const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
	const preparedSourceInfo = await actualSource.query.getDocumentInfo()
	const sourceInfoBefore = structuredClone(preparedSourceInfo)

	if (testCase.rollbackFirst) {
		const sentinel = new Error('test-owned rollback after supervision dependency cleanup')
		const rejection = await target
			.transaction(async function extractThenRollback(tx) {
				const result = await tx.lifecycle.extract.ied(extractParams)
				expect(result.warnings).toHaveLength(expectedWarnings.length)
				expect(result.warnings).toEqual(expect.arrayContaining(expectedWarnings))
				throw sentinel
			})
			.catch(function caught(error: unknown) {
				return error
			})
		const parsed = toDialecteError(rejection)
		expect(parsed?.key).toBe('UNKNOWN')
		expect(parsed?.cause).toBe(sentinel)
		const rolledBackXml = await target.query.getSnapshot({ as: 'xml' })
		const rolledBackInfo = await target.query.getDocumentInfo()
		expect(rolledBackXml).toBe(targetBefore)
		expect(rolledBackInfo).toEqual(targetInfoBefore)
		const sourceAfterRollback = await actualSource.query.getSnapshot({ as: 'xml' })
		const sourceInfoAfterRollback = await actualSource.query.getDocumentInfo()
		expect(sourceAfterRollback).toBe(sourceBefore)
		expect(sourceInfoAfterRollback).toEqual(sourceInfoBefore)
	}

	const result = await target.transaction(async function extract(tx) {
		return tx.lifecycle.extract.ied(extractParams)
	})
	expect(result.warnings).toHaveLength(expectedWarnings.length)
	expect(result.warnings).toEqual(expect.arrayContaining(expectedWarnings))

	await expectDataSetsFollowSource(params)
	await expectControlsFollowSource(params)
	await expectVendorHomonymsCopied(params)
	const targetReport = await collectSclOutputViolations({ project, document: target })
	expect(targetReport.violations).toEqual([])

	const sourceAfter = await actualSource.query.getSnapshot({ as: 'xml' })
	const sourceInfoAfter = await actualSource.query.getDocumentInfo()
	expect(sourceAfter).toBe(sourceBefore)
	expect(sourceInfoAfter).toEqual(sourceInfoBefore)
	return { assertOn: 'target' }
}

/** Every dataset of the selected IED: gone when no ordinary FCDA is left, else the source one minus the supervision FCDAs. */
async function expectDataSetsFollowSource(params: ExtractParams): Promise<void> {
	const { act, actualSource } = params
	const { testCase } = act
	const target = act.target!
	const sourceTree = await actualSource.query.getSnapshot({ as: 'tree', unwrap: [] })
	const targetTree = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
	const sourceEntries = treeEntriesOf(sourceTree).filter(retainedSelectedEntry)
	const targetEntries = treeEntriesOf(targetTree)
	const sourceDataSets = sourceEntries.filter(function dataSet(entry) {
		return entry.record.tagName === 'DataSet'
	})
	for (const sourceDataSet of sourceDataSets) {
		const identity = scopedIdentity(sourceDataSet)
		const counterparts = targetEntries.filter(function sameDataSet(entry) {
			return (
				entry.record.namespace.uri === nativeNamespace &&
				entry.record.tagName === 'DataSet' &&
				scopedIdentity(entry) === identity
			)
		})
		const survivingChildren = sourceDataSet.record.tree.filter(function retained(child) {
			return !(
				child.namespace.uri === nativeNamespace &&
				child.tagName === 'FCDA' &&
				['LGOS', 'LSVS'].includes(readAttribute({ record: child, name: 'lnClass' }))
			)
		})
		const survives = survivingChildren.some(function nativeFcda(child) {
			return child.namespace.uri === nativeNamespace && child.tagName === 'FCDA'
		})
		expect(counterparts, identity).toHaveLength(survives ? 1 : 0)
		if (survives) {
			const expected = semanticSubtree({
				tree: { ...sourceDataSet.record, tree: survivingChildren },
			})
			const actual = semanticSubtree({ tree: counterparts[0].record })
			expect(actual, identity).toEqual(expected)
		}
	}
	const fcdas = await target.query.getRecordsByTagName('FCDA')
	const nativeFcdas = fcdas.filter(function native(record) {
		return record.namespace.uri === nativeNamespace
	})
	for (const fcda of nativeFcdas) {
		const lnClass = await target.query.getAttribute(fcda, { name: 'lnClass' })
		expect(['LGOS', 'LSVS']).not.toContain(lnClass)
	}
	expect(nativeFcdas).toHaveLength(testCase.nativeFcdas)
	const dataSets = await target.query.getRecordsByTagName('DataSet')
	const nativeDataSets = dataSets.filter(function native(record) {
		return record.namespace.uri === nativeNamespace
	})
	expect(nativeDataSets).toHaveLength(testCase.nativeDataSets)
}

/** Every control block of the selected IED: the affected ones updated once, the others byte for byte. */
async function expectControlsFollowSource(params: ExtractParams): Promise<void> {
	const { act, actualSource } = params
	const { testCase } = act
	const target = act.target!
	const sourceTree = await actualSource.query.getSnapshot({ as: 'tree', unwrap: [] })
	const targetTree = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
	const sourceEntries = treeEntriesOf(sourceTree).filter(retainedSelectedEntry)
	const targetEntries = treeEntriesOf(targetTree)
	for (const tag of controlTags) {
		const targetControls = await target.query.getRecordsByTagName(tag)
		const nativeControls = targetControls.filter(function native(record) {
			return record.namespace.uri === nativeNamespace
		})
		expect(nativeControls).toHaveLength(testCase.controlsPerTag)
		const sourceControls = sourceEntries.filter(function sameTag(entry) {
			return entry.record.tagName === tag
		})
		const targetControlEntries = targetEntries.filter(function nativeControl(entry) {
			return entry.record.namespace.uri === nativeNamespace && entry.record.tagName === tag
		})
		expect(targetControlEntries.map(scopedIdentity).sort()).toEqual(
			sourceControls.map(scopedIdentity).sort(),
		)
		for (const control of nativeControls) {
			const targetCounterparts = targetControlEntries.filter(function sameRecord(entry) {
				return entry.record.id === control.id
			})
			expect(targetCounterparts).toHaveLength(1)
			const identity = scopedIdentity(targetCounterparts[0])
			const sourceCounterparts = sourceControls.filter(function sameIdentity(entry) {
				return scopedIdentity(entry) === identity
			})
			expect(sourceCounterparts, identity).toHaveLength(1)
			const sourceControl = sourceCounterparts[0]
			const association = await target.query.getAttribute(control, { name: 'datSet' })
			const affected =
				readAttribute({ record: sourceControl.record, name: 'datSet' }) === 'Events' &&
				sourceControl.ancestors.some(function affectedDevice(record) {
					return (
						record.namespace.uri === nativeNamespace &&
						record.tagName === 'LDevice' &&
						readAttribute({ record, name: 'inst' }) === 'LD1'
					)
				})
			if (affected) {
				const expected = semanticSubtree({
					tree: sourceControl.record,
					attributeOverrides: {
						datSet: testCase.expectedDatSet,
						...(tag === 'LogControl' ? { logEna: 'false' } : { confRev: testCase.expectedConfRev }),
					},
				})
				const actual = semanticSubtree({ tree: targetCounterparts[0].record })
				expect(actual, identity).toEqual(expected)
				const associationAttribute = await target.query.getAttribute(control, {
					name: 'datSet',
					fullObject: true,
				})
				expect(associationAttribute?.value).toBe(testCase.expectedDatSet)
				if (tag === 'LogControl') {
					const enabled = await target.query.getAttribute(control, { name: 'logEna' })
					expect(enabled).toBe('false')
					const attributes = await target.query.getAttributes(control)
					expect(attributes).not.toHaveProperty('confRev')
				} else {
					const revision = await target.query.getAttribute(control, { name: 'confRev' })
					expect(revision).toBe(testCase.expectedConfRev)
				}
			} else {
				const sourceRef = {
					tagName: tag,
					id: sourceControl.record.id,
				} as Scl.Ref<typeof tag>
				const before = await actualSource.query.getSnapshot({
					ref: sourceRef,
					as: 'xml',
				})
				const after = await target.query.getSnapshot({ ref: control, as: 'xml' })
				expect(after, identity).toBe(before)
			}
			if (association) {
				if (!control.parent || !['LN0', 'LN'].includes(control.parent.tagName)) {
					throw new Error('native control must have a logical-node parent')
				}
				const parent = control.parent as Scl.Ref<'LN0' | 'LN'>
				const siblings = await target.query.getChildren(parent, 'DataSet')
				const matches = []
				for (const sibling of siblings) {
					const dataSetName = await target.query.getAttribute(sibling, { name: 'name' })
					if (sibling.namespace.uri === nativeNamespace && dataSetName === association)
						matches.push(sibling)
				}
				expect(matches).toHaveLength(1)
			}
		}
	}
}

/** Vendor content with the names of native elements travels as it is. */
async function expectVendorHomonymsCopied(params: ExtractParams): Promise<void> {
	const { act, actualSource } = params
	const target = act.target!
	const sourcePrivate = await actualSource.query.getRecordsByTagName('Private')
	const targetPrivate = await target.query.getRecordsByTagName('Private')
	for (const beforePrivate of sourcePrivate) {
		const type = await actualSource.query.getAttribute(beforePrivate, { name: 'type' })
		if (type !== 'vendor.homonyms') continue
		const before = await actualSource.query.getSnapshot({ ref: beforePrivate, as: 'xml' })
		const corresponding = []
		for (const afterPrivate of targetPrivate) {
			const afterType = await target.query.getAttribute(afterPrivate, { name: 'type' })
			if (afterType === type) corresponding.push(afterPrivate)
		}
		expect(corresponding).toHaveLength(1)
		const after = await target.query.getSnapshot({ ref: corresponding[0], as: 'xml' })
		expect(after).toBe(before)
	}
}

describe('extract IED supervision dependencies', () => {
	describe('FCDA found by its uuid', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'LGOS FCDA in a mixed dataset with payload → FCDA removed, payload and four consumers kept, a rolled back extraction leaves no trace':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
							<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
								<Private type="vendor.homonyms">
									<vendor:LN lnClass="LGOS" inst="1">
										<vendor:DataSet name="Events">
											<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
										</vendor:DataSet>
										<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
										<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
									</vendor:LN>
								</Private>
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<Text>affected dataset text</Text>
													<Private type="vendor.dataset">
														<vendor:Payload key="retained-if-mixed">opaque data</vendor:Payload>
													</Private>
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<DataSet name="Untouched">
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportAffected" datSet="Events" confRev="17">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
													<SmvOpts/>
												</SampledValueControl>
												<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
												<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<DataTypeTemplates>
								<LNodeType id="LLN0_Type" lnClass="LLN0">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="PTOC_Type" lnClass="PTOC">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="Supervision_Type" lnClass="LGOS">
									<DO name="Status" type="Status_Type"/>
									<DO name="Other" type="Status_Type"/>
								</LNodeType>
								<DOType id="Status_Type" cdc="SPS">
									<DA name="stVal" bType="BOOLEAN" fc="ST"/>
									<DA name="q" bType="Quality" fc="ST"/>
								</DOType>
							</DataTypeTemplates>
						</SCL>
					`,
					targetXml: emptyTarget,
					expectedDatSet: 'Events',
					nativeFcdas: 2,
					nativeDataSets: 2,
					controlsPerTag: 2,
					expectedConfRev: '10017',
					rollbackFirst: true,
					expectedQueries: [
						...keptQueries,
						'//default:DataSet[@name="Events"]/default:Text[contains(., "affected dataset text")]',
						'//default:DataSet[@name="Events"]/default:Private[@type="vendor.dataset"]/*[local-name()="Payload"][contains(., "opaque data")]',
					],
					unexpectedQueries: leftOutQueries,
				},
			'last LGOS FCDA of a plain dataset → dataset pruned, consumers kept and unlinked': {
				sourceXml: /* xml */ `
					<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
						<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
						<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
							<Private type="vendor.homonyms">
								<vendor:LN lnClass="LGOS" inst="1">
									<vendor:DataSet name="Events">
										<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
									</vendor:DataSet>
									<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
									<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
								</vendor:LN>
							</Private>
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
											<DataSet name="Events">
												<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
												<!-- no ordinary FCDA: the supervision one is the last -->
											</DataSet>
											<DataSet name="Untouched">
												<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
											</DataSet>
											<ReportControl name="ReportAffected" datSet="Events" confRev="17">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
											<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
												<SmvOpts/>
											</SampledValueControl>
											<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
											<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
												<SmvOpts/>
											</SampledValueControl>
											<Log name="EventsLog"/>
										</LN0>
										<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
										<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
										<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_Type" lnClass="LLN0">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="PTOC_Type" lnClass="PTOC">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="Supervision_Type" lnClass="LGOS">
								<DO name="Status" type="Status_Type"/>
								<DO name="Other" type="Status_Type"/>
							</LNodeType>
							<DOType id="Status_Type" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
								<DA name="q" bType="Quality" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTarget,
				expectedDatSet: undefined,
				nativeFcdas: 1,
				nativeDataSets: 1,
				controlsPerTag: 2,
				expectedConfRev: '10017',
				expectedQueries: keptQueries,
				unexpectedQueries: leftOutQueries,
			},
			'last LSVS FCDA of a dataset with payload → whole zero-FCDA dataset removed with its payload':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
							<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
								<Private type="vendor.homonyms">
									<vendor:LN lnClass="LSVS" inst="1">
										<vendor:DataSet name="Events">
											<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
										</vendor:DataSet>
										<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
										<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
									</vendor:LN>
								</Private>
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<Text>affected dataset text</Text>
													<Private type="vendor.dataset">
														<vendor:Payload key="retained-if-mixed">opaque data</vendor:Payload>
													</Private>
													<FCDA ldInst="LD1" prefix="" lnClass="LSVS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
													<!-- no ordinary FCDA: the supervision one is the last -->
												</DataSet>
												<DataSet name="Untouched">
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportAffected" datSet="Events" confRev="17">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
													<SmvOpts/>
												</SampledValueControl>
												<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
												<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
											<LN lnClass="LSVS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
											<LN lnClass="LSVS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<DataTypeTemplates>
								<LNodeType id="LLN0_Type" lnClass="LLN0">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="PTOC_Type" lnClass="PTOC">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="Supervision_Type" lnClass="LSVS">
									<DO name="Status" type="Status_Type"/>
									<DO name="Other" type="Status_Type"/>
								</LNodeType>
								<DOType id="Status_Type" cdc="SPS">
									<DA name="stVal" bType="BOOLEAN" fc="ST"/>
									<DA name="q" bType="Quality" fc="ST"/>
								</DOType>
							</DataTypeTemplates>
						</SCL>
					`,
					targetXml: emptyTarget,
					expectedDatSet: undefined,
					nativeFcdas: 1,
					nativeDataSets: 1,
					controlsPerTag: 2,
					expectedConfRev: '10017',
					expectedQueries: keptQueries,
					unexpectedQueries: [
						...leftOutQueries,
						'//*[text()[contains(., "affected dataset text")]]',
						'//*[text()[contains(., "opaque data")]]',
					],
				},
			'omitted supervision LN holding consumers with overflowing counters → those consumers ignored':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
							<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
								<Private type="vendor.homonyms">
									<vendor:LN lnClass="LGOS" inst="1">
										<vendor:DataSet name="Events">
											<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
										</vendor:DataSet>
										<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
										<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
									</vendor:LN>
								</Private>
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<DataSet name="Untouched">
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportAffected" datSet="Events" confRev="17">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
													<SmvOpts/>
												</SampledValueControl>
												<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
												<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision">
												<DataSet name="OmittedEvents">
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="OmittedReport" datSet="OmittedEvents" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="OmittedLog" datSet="OmittedEvents" logName="OwnLog" logEna="true"/>
												<Log name="OwnLog"/>
											</LN>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<DataTypeTemplates>
								<LNodeType id="LLN0_Type" lnClass="LLN0">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="PTOC_Type" lnClass="PTOC">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="Supervision_Type" lnClass="LGOS">
									<DO name="Status" type="Status_Type"/>
									<DO name="Other" type="Status_Type"/>
								</LNodeType>
								<DOType id="Status_Type" cdc="SPS">
									<DA name="stVal" bType="BOOLEAN" fc="ST"/>
									<DA name="q" bType="Quality" fc="ST"/>
								</DOType>
							</DataTypeTemplates>
						</SCL>
					`,
					targetXml: emptyTarget,
					expectedDatSet: 'Events',
					nativeFcdas: 2,
					nativeDataSets: 2,
					controlsPerTag: 2,
					expectedConfRev: '10017',
					expectedQueries: keptQueries,
					unexpectedQueries: leftOutQueries,
				},
			'several supervision FCDAs in one dataset → each removed, consumers unlinked and incremented once':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
							<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
								<Private type="vendor.homonyms">
									<vendor:LN lnClass="LGOS" inst="1">
										<vendor:DataSet name="Events">
											<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
										</vendor:DataSet>
										<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
										<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
									</vendor:LN>
								</Private>
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Other" daName="stVal" fc="ST"/>
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="q" fc="ST"/>
													<!-- no ordinary FCDA: the supervision ones are all it holds -->
												</DataSet>
												<DataSet name="Untouched">
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportAffected" datSet="Events" confRev="17">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
													<SmvOpts/>
												</SampledValueControl>
												<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
												<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<DataTypeTemplates>
								<LNodeType id="LLN0_Type" lnClass="LLN0">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="PTOC_Type" lnClass="PTOC">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="Supervision_Type" lnClass="LGOS">
									<DO name="Status" type="Status_Type"/>
									<DO name="Other" type="Status_Type"/>
								</LNodeType>
								<DOType id="Status_Type" cdc="SPS">
									<DA name="stVal" bType="BOOLEAN" fc="ST"/>
									<DA name="q" bType="Quality" fc="ST"/>
								</DOType>
							</DataTypeTemplates>
						</SCL>
					`,
					targetXml: emptyTarget,
					expectedDatSet: undefined,
					nativeFcdas: 1,
					nativeDataSets: 1,
					controlsPerTag: 2,
					expectedConfRev: '10017',
					expectedQueries: keptQueries,
					unexpectedQueries: leftOutQueries,
				},
			'affected counter at the highest value that can still grow → becomes the uint32 maximum': {
				sourceXml: /* xml */ `
					<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
						<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
						<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
							<Private type="vendor.homonyms">
								<vendor:LN lnClass="LGOS" inst="1">
									<vendor:DataSet name="Events">
										<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
									</vendor:DataSet>
									<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
									<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
								</vendor:LN>
							</Private>
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
											<DataSet name="Events">
												<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
												<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
											</DataSet>
											<DataSet name="Untouched">
												<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
											</DataSet>
											<ReportControl name="ReportAffected" datSet="Events" confRev="4294957295">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="4294957295"/>
											<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="4294957295">
												<SmvOpts/>
											</SampledValueControl>
											<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
											<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
												<SmvOpts/>
											</SampledValueControl>
											<Log name="EventsLog"/>
										</LN0>
										<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
										<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
										<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_Type" lnClass="LLN0">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="PTOC_Type" lnClass="PTOC">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="Supervision_Type" lnClass="LGOS">
								<DO name="Status" type="Status_Type"/>
								<DO name="Other" type="Status_Type"/>
							</LNodeType>
							<DOType id="Status_Type" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
								<DA name="q" bType="Quality" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTarget,
				expectedDatSet: 'Events',
				nativeFcdas: 2,
				nativeDataSets: 2,
				controlsPerTag: 2,
				expectedConfRev: '4294967295',
				expectedQueries: keptQueries,
				unexpectedQueries: leftOutQueries,
			},
		}

		async function act(params: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
			const actualSource = await importProjectFile(params)
			return extractAndExpect({ act: params, actualSource })
		}

		runSclTestCases.withExport({ testCases, act })
	})

	describe('FCDA found by its names, its uuid absent', () => {
		const testCases: SclTest.TestCases<NamesOnlyTestCase> = {
			'LSVS FCDA named by its complete tuple in a mixed dataset → resolved and removed': {
				sourceXml: /* xml */ `
					<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
						<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
						<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
							<Private type="vendor.homonyms">
								<vendor:LN lnClass="LSVS" inst="1">
									<vendor:DataSet name="Events">
										<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
									</vendor:DataSet>
									<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
									<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
								</vendor:LN>
							</Private>
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
											<DataSet name="Events">
												<FCDA ldInst="LD1" prefix="" lnClass="LSVS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
												<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
											</DataSet>
											<DataSet name="Untouched">
												<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
											</DataSet>
											<ReportControl name="ReportAffected" datSet="Events" confRev="17">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
											<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
												<SmvOpts/>
											</SampledValueControl>
											<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
												<OptFields/>
											</ReportControl>
											<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
												<TrgOps dchg="true"/>
											</LogControl>
											<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
											<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
												<SmvOpts/>
											</SampledValueControl>
											<Log name="EventsLog"/>
										</LN0>
										<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
										<LN lnClass="LSVS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
							<AccessPoint name="AP1">
								<Server>
									<Authentication/>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
										<LN lnClass="LSVS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_Type" lnClass="LLN0">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="PTOC_Type" lnClass="PTOC">
								<DO name="Status" type="Status_Type"/>
							</LNodeType>
							<LNodeType id="Supervision_Type" lnClass="LSVS">
								<DO name="Status" type="Status_Type"/>
								<DO name="Other" type="Status_Type"/>
							</LNodeType>
							<DOType id="Status_Type" cdc="SPS">
								<DA name="stVal" bType="BOOLEAN" fc="ST"/>
								<DA name="q" bType="Quality" fc="ST"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTarget,
				supervisionClass: 'LSVS',
				expectedDatSet: 'Events',
				nativeFcdas: 2,
				nativeDataSets: 2,
				controlsPerTag: 2,
				expectedConfRev: '10017',
				expectedQueries: keptQueries,
				unexpectedQueries: leftOutQueries,
			},
			'homonyms in another LDevice and in vendor content → own LDevice tuple only, homonyms and their consumers unchanged':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
							<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
							<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
								<Private type="vendor.homonyms">
									<vendor:LN lnClass="LGOS" inst="1">
										<vendor:DataSet name="Events">
											<vendor:FCDA lnUuid="50000000-0000-4000-8000-000000000003"/>
										</vendor:DataSet>
										<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
										<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
									</vendor:LN>
								</Private>
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<FCDA ldInst="LD1" prefix="" lnClass="LGOS" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000003" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<DataSet name="Untouched">
													<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000002" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportAffected" datSet="Events" confRev="17">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="17"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="17">
													<SmvOpts/>
												</SampledValueControl>
												<ReportControl name="ReportUntouched" datSet="Untouched" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogUntouched" datSet="Untouched" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseUntouched" datSet="Untouched" appID="EventsUntouched" confRev="4294967295"/>
												<SampledValueControl name="SamplesUntouched" datSet="Untouched" smvID="EventsUntouched" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000002"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000003" ${id}="omitted-supervision"></LN>
										</LDevice>
									</Server>
								</AccessPoint>
								<AccessPoint name="AP2">
									<Server>
										<Authentication/>
										<LDevice inst="LD2">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
												<DataSet name="Events">
													<FCDA ldInst="LD2" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000004" doName="Status" daName="stVal" fc="ST"/>
												</DataSet>
												<ReportControl name="ReportOtherScope" datSet="Events" confRev="4294967295">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogOtherScope" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseOtherScope" datSet="Events" appID="EventsOtherScope" confRev="4294967295"/>
												<SampledValueControl name="SamplesOtherScope" datSet="Events" smvID="EventsOtherScope" smpRate="80" nofASDU="1" confRev="4294967295">
													<SmvOpts/>
												</SampledValueControl>
												<Log name="EventsLog"/>
											</LN0>
											<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000004"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
								<AccessPoint name="AP1">
									<Server>
										<Authentication/>
										<LDevice inst="LD1">
											<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
											<LN lnClass="LGOS" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
										</LDevice>
									</Server>
								</AccessPoint>
							</IED>
							<DataTypeTemplates>
								<LNodeType id="LLN0_Type" lnClass="LLN0">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="PTOC_Type" lnClass="PTOC">
									<DO name="Status" type="Status_Type"/>
								</LNodeType>
								<LNodeType id="Supervision_Type" lnClass="LGOS">
									<DO name="Status" type="Status_Type"/>
									<DO name="Other" type="Status_Type"/>
								</LNodeType>
								<DOType id="Status_Type" cdc="SPS">
									<DA name="stVal" bType="BOOLEAN" fc="ST"/>
									<DA name="q" bType="Quality" fc="ST"/>
								</DOType>
							</DataTypeTemplates>
						</SCL>
					`,
					targetXml: emptyTarget,
					supervisionClass: 'LGOS',
					expectedDatSet: 'Events',
					nativeFcdas: 3,
					nativeDataSets: 3,
					controlsPerTag: 3,
					expectedConfRev: '10017',
					expectedQueries: keptQueries,
					unexpectedQueries: leftOutQueries,
				},
		}

		async function act(params: SclTest.ActParams<NamesOnlyTestCase>): Promise<SclTest.ActResult> {
			const actualSource = await importProjectFile(params)
			// the import fills the uuid from the names: only a write can take it away
			await actualSource.transaction(async function clearImportedTwin(tx) {
				await tx.update(supervisionRef, { attributes: { lnUuid: undefined } })
			})
			const uuid = await actualSource.query.getAttribute(supervisionRef, {
				name: 'lnUuid',
				fullObject: true,
			})
			expect(uuid).toBeUndefined()
			const attributes = await actualSource.query.getAttributes(supervisionRef)
			expect(attributes).toMatchObject({
				ldInst: 'LD1',
				lnInst: '1',
				doName: 'Status',
				daName: 'stVal',
				fc: 'ST',
			})
			expect(attributes.lnClass).toBe(params.testCase.supervisionClass)
			const prefix = await actualSource.query.getAttribute(supervisionRef, { name: 'prefix' })
			expect(prefix).toBe('')
			return extractAndExpect({ act: params, actualSource })
		}

		runSclTestCases.withExport({ testCases, act })
	})
})
