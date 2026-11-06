import { toDialecteError } from '@dialecte/core'
import { describe, expect, vi } from 'vitest'

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
const supervisionUuid = '50000000-0000-4000-8000-000000000003'
const ordinaryUuid = '50000000-0000-4000-8000-000000000002'
const emptyTarget = /* xml */ `<SCL ${ns}/>`
const controlTags = ['ReportControl', 'GSEControl', 'SampledValueControl', 'LogControl'] as const

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mixed: boolean
	payload?: boolean
	namesOnly?: boolean
	scoped?: boolean
	omittedBranch?: boolean
	several?: boolean
	rollbackFirst?: boolean
	prior?: string
	refusal?: 'EXTRACTION_CONF_REV_INVALID' | 'EXTRACTION_CONF_REV_OVERFLOW'
	counter?: { tag: 'ReportControl' | 'GSEControl' | 'SampledValueControl'; value?: string }
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

function controls(params: { suffix: string; dataSet: string; revision: string }): string {
	const { suffix, dataSet, revision } = params
	return /* xml */ `
		<ReportControl name="Report${suffix}" datSet="${dataSet}" confRev="${revision}">
			<OptFields/>
		</ReportControl>
		<LogControl name="Log${suffix}" datSet="${dataSet}" logName="EventsLog" logEna="true">
			<TrgOps dchg="true"/>
		</LogControl>
		<GSEControl name="Goose${suffix}" datSet="${dataSet}" appID="Events${suffix}" confRev="${revision}"/>
		<SampledValueControl name="Samples${suffix}" datSet="${dataSet}" smvID="Events${suffix}" smpRate="80" nofASDU="1" confRev="${revision}">
			<SmvOpts/>
		</SampledValueControl>
	`
}

function fixture(params: {
	supervision?: 'LGOS' | 'LSVS'
	mixed: boolean
	payload?: boolean
	scoped?: boolean
	omittedBranch?: boolean
	several?: boolean
	prior?: string
}): string {
	const {
		supervision = 'LGOS',
		mixed,
		payload,
		scoped,
		omittedBranch,
		several,
		prior = '17',
	} = params
	const ordinaryFcda = /* xml */ `<FCDA ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1" lnUuid="${ordinaryUuid}" doName="Status" daName="stVal" fc="ST"/>`
	const supervisionFcda = /* xml */ `<FCDA ldInst="LD1" prefix="" lnClass="${supervision}" lnInst="1" lnUuid="${supervisionUuid}" doName="Status" daName="stVal" fc="ST" ${id}="supervision-fcda"/>`
	const extraFcdas = several
		? /* xml */ `
			<FCDA ldInst="LD1" prefix="" lnClass="${supervision}" lnInst="1" lnUuid="${supervisionUuid}" doName="Other" daName="stVal" fc="ST"/>
			<FCDA ldInst="LD1" prefix="" lnClass="${supervision}" lnInst="1" lnUuid="${supervisionUuid}" doName="Status" daName="q" fc="ST"/>
		`
		: ''
	const dataSetPayload = payload
		? /* xml */ `
			<Text>affected dataset text</Text>
			<Private type="vendor.dataset">
				<vendor:Payload key="retained-if-mixed">opaque data</vendor:Payload>
			</Private>
		`
		: ''
	const omittedFcda = supervisionFcda.replace(' ' + id + '="supervision-fcda"', '')
	const omittedContent = omittedBranch
		? /* xml */ `
			<DataSet name="OmittedEvents">${omittedFcda}</DataSet>
			<ReportControl name="OmittedReport" datSet="OmittedEvents" confRev="4294967295">
				<OptFields/>
			</ReportControl>
			<LogControl name="OmittedLog" datSet="OmittedEvents" logName="OwnLog" logEna="true"/>
			<Log name="OwnLog"/>
		`
		: ''
	const secondAccessPoint = scoped
		? /* xml */ `
			<AccessPoint name="AP2">
				<Server>
					<Authentication/>
					<LDevice inst="LD2">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
				<DataSet name="Events"><FCDA ldInst="LD2" prefix="" lnClass="PTOC" lnInst="1" lnUuid="50000000-0000-4000-8000-000000000004" doName="Status" daName="stVal" fc="ST"/></DataSet>
				${controls({ suffix: 'OtherScope', dataSet: 'Events', revision: '4294967295' })}
				<Log name="EventsLog"/>
			</LN0>
						<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="50000000-0000-4000-8000-000000000004"/>
					</LDevice>
				</Server>
			</AccessPoint>
		`
		: ''
	return /* xml */ `
		<SCL ${ns} xmlns:vendor="urn:supervision-dependencies:test">
			<Header id="ProjectSource" fileType="SCD" uuid="10000000-0000-4000-8000-000000000001" version="2" revision="B"/>
			<IED name="Selected" uuid="20000000-0000-4000-8000-000000000001" ${id}="selected-ied">
				<Private type="vendor.homonyms">
					<vendor:LN lnClass="${supervision}" inst="1">
						<vendor:DataSet name="Events"><vendor:FCDA lnUuid="${supervisionUuid}"/></vendor:DataSet>
						<vendor:ReportControl name="ReportAffected" datSet="Events" confRev="4294967295"/>
						<vendor:LogControl name="LogAffected" datSet="Events" logEna="true"/>
					</vendor:LN>
				</Private>
				<AccessPoint name="AP1"><Server><Authentication/><LDevice inst="LD1">
					<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type">
						<DataSet name="Events">${dataSetPayload}${supervisionFcda}${extraFcdas}${mixed ? ordinaryFcda : ''}</DataSet>
						<DataSet name="Untouched">${ordinaryFcda}</DataSet>
						${controls({ suffix: 'Affected', dataSet: 'Events', revision: prior })}
						${controls({ suffix: 'Untouched', dataSet: 'Untouched', revision: '4294967295' })}
						<Log name="EventsLog"/>
					</LN0>
					<LN lnClass="PTOC" inst="1" lnType="PTOC_Type" uuid="${ordinaryUuid}"/>
					<LN lnClass="${supervision}" inst="1" lnType="Supervision_Type" uuid="${supervisionUuid}" ${id}="omitted-supervision">${omittedContent}</LN>
				</LDevice></Server></AccessPoint>
				${secondAccessPoint}
			</IED>
			<IED name="Foreign" uuid="20000000-0000-4000-8000-000000000002">
				<AccessPoint name="AP1">
					<Server>
						<Authentication/>
						<LDevice inst="LD1">
							<LN0 lnClass="LLN0" inst="" lnType="LLN0_Type"/>
							<LN lnClass="${supervision}" inst="1" lnType="Supervision_Type" uuid="50000000-0000-4000-8000-000000000005"/>
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
				<LNodeType id="Supervision_Type" lnClass="${supervision}">
					<DO name="Status" type="Status_Type"/>
					<DO name="Other" type="Status_Type"/>
				</LNodeType>
				<DOType id="Status_Type" cdc="SPS">
					<DA name="stVal" bType="BOOLEAN" fc="ST"/>
					<DA name="q" bType="Quality" fc="ST"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>
	`
}

describe('extract IED supervision dependencies', () => {
	const testCases: Record<string, TestCase> = {
		'mixed-lgos-uuid -> remove supervision FCDA, retain payload and four consumers': {
			sourceXml: fixture({ mixed: true, payload: true }),
			targetXml: emptyTarget,
			mixed: true,
			payload: true,
			rollbackFirst: true,
		},
		'mixed-lsvs-names -> resolve complete tuple only when UUID absent': {
			sourceXml: fixture({ supervision: 'LSVS', mixed: true }),
			targetXml: emptyTarget,
			mixed: true,
			namesOnly: true,
		},
		'last-lgos-uuid -> prune plain dataset and retain unlinked consumers': {
			sourceXml: fixture({ mixed: false }),
			targetXml: emptyTarget,
			mixed: false,
		},
		'last-lsvs-payload -> delete whole zero-FCDA container including payload': {
			sourceXml: fixture({ supervision: 'LSVS', mixed: false, payload: true }),
			targetXml: emptyTarget,
			mixed: false,
			payload: true,
		},
		'scope-and-vendor -> own LD tuple only, opaque homonyms and other consumers unchanged': {
			sourceXml: fixture({ mixed: true, scoped: true }),
			targetXml: emptyTarget,
			mixed: true,
			scoped: true,
			namesOnly: true,
		},
		'omitted-branch -> ignore omitted consumers even with overflowing counters': {
			sourceXml: fixture({ mixed: true, omittedBranch: true }),
			targetXml: emptyTarget,
			mixed: true,
			omittedBranch: true,
		},
		'several-removals-once -> distinct FCDA removals and unlink increment once': {
			sourceXml: fixture({ mixed: false, several: true }),
			targetXml: emptyTarget,
			mixed: false,
			several: true,
		},
		'revision-upper-bound -> maximum safe prior becomes uint32 maximum': {
			sourceXml: fixture({ mixed: true, prior: '4294957295' }),
			targetXml: emptyTarget,
			mixed: true,
			prior: '4294957295',
		},
		'revision-overflow -> refuse before writes without reset or wrap': {
			sourceXml: fixture({ mixed: true, prior: '4294957296' }),
			targetXml: emptyTarget,
			mixed: true,
			prior: '4294957296',
			refusal: 'EXTRACTION_CONF_REV_OVERFLOW',
		},
	}

	for (const [key, counter] of Object.entries({
		'missing-optional-gse': { tag: 'GSEControl', value: undefined },
		'missing-optional-sv': { tag: 'SampledValueControl', value: undefined },
		'missing-required-report': { tag: 'ReportControl', value: undefined },
		'malformed-report': { tag: 'ReportControl', value: 'not-a-number' },
		'negative-gse': { tag: 'GSEControl', value: '-1' },
		'above-uint32-sv': { tag: 'SampledValueControl', value: '4294967296' },
	} as const)) {
		testCases[`revision-invalid-or-missing/${key} -> refuse without zero default`] = {
			sourceXml: fixture({ mixed: true }),
			targetXml: emptyTarget,
			mixed: true,
			counter,
			refusal: 'EXTRACTION_CONF_REV_INVALID',
		}
	}
	for (const testCase of Object.values(testCases)) {
		if (testCase.refusal) continue
		testCase.expectedQueries = [
			'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"]',
			'//default:LDevice[@inst="LD1"]/default:LN0/default:DataSet[@name="Untouched"][count(default:FCDA)=1]/default:FCDA[@lnClass="PTOC"][@lnInst="1"][@doName="Status"][@daName="stVal"][@fc="ST"]',
			'//default:Private[@type="vendor.homonyms"]/*[local-name()="LN"][namespace-uri()="urn:supervision-dependencies:test"]/*[local-name()="ReportControl"][@confRev="4294967295"]',
		]
		testCase.unexpectedQueries = [
			'//default:IED[@name="Foreign"]',
			'//default:LN[@lnClass="LGOS" or @lnClass="LSVS"]',
			'//default:FCDA[@lnClass="LGOS" or @lnClass="LSVS"]',
		]
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
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
		const supervisionRef = { tagName: 'FCDA', id: 'supervision-fcda' } as const
		if (testCase.namesOnly) {
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
			expect(attributes.lnClass).toBe(testCase.scoped ? 'LGOS' : 'LSVS')
			const prefix = await actualSource.query.getAttribute(supervisionRef, { name: 'prefix' })
			expect(prefix).toBe('')
		}

		const params = {
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
		let preparedCounter: Scl.Ref<'ReportControl' | 'GSEControl' | 'SampledValueControl'> | undefined
		if (testCase.counter) {
			const candidates = await actualSource.query.getRecordsByTagName(testCase.counter.tag)
			for (const candidate of candidates) {
				const name = await actualSource.query.getAttribute(candidate, { name: 'name' })
				if (name?.endsWith('Affected')) {
					preparedCounter = { tagName: candidate.tagName, id: candidate.id }
				}
			}
			expect(preparedCounter).toBeDefined()
		}
		try {
			if (testCase.counter && preparedCounter) {
				await actualSource.transaction(async function prepareCounterThroughPublicApi(tx) {
					if (testCase.counter?.value === undefined) {
						await tx.update(preparedCounter, { attributes: { confRev: undefined } })
					} else if (preparedCounter) {
						await tx.any.update(preparedCounter, {
							attributes: { confRev: testCase.counter.value },
						})
					}
				})
				const actual = await actualSource.query.getAttribute(preparedCounter, {
					name: 'confRev',
					fullObject: true,
				})
				expect(actual?.value).toBe(testCase.counter.value)
			}
			const sourceBefore = await actualSource.query.getSnapshot({ as: 'xml' })
			const preparedSourceInfo = await actualSource.query.getDocumentInfo()
			const sourceInfoBefore = structuredClone(preparedSourceInfo)
			try {
				if (testCase.refusal) {
					const observed = await target.transaction(async function catchRefusalAndCommit(tx) {
						const stagedBefore = await tx.getSnapshot({ as: 'xml' })
						const operationsBefore = [...tx.getStagedOperations()]
						const addChild = vi.spyOn(tx, 'addChild')
						const ensureChild = vi.spyOn(tx, 'ensureChild')
						const deepClone = vi.spyOn(tx, 'deepClone')
						const update = vi.spyOn(tx, 'update')
						const remove = vi.spyOn(tx, 'delete')
						try {
							const rejection = await tx.lifecycle.extract.ied(params).catch(function caught(
								error: unknown,
							) {
								return error
							})
							const parsed = toDialecteError(rejection)
							const stagedAfter = await tx.getSnapshot({ as: 'xml' })
							return {
								key: parsed?.key,
								stagedBefore,
								stagedAfter,
								operationsBefore,
								operationsAfter: [...tx.getStagedOperations()],
								addChildCalls: addChild.mock.calls.length,
								ensureChildCalls: ensureChild.mock.calls.length,
								deepCloneCalls: deepClone.mock.calls.length,
								updateCalls: update.mock.calls.length,
								deleteCalls: remove.mock.calls.length,
							}
						} finally {
							addChild.mockRestore()
							ensureChild.mockRestore()
							deepClone.mockRestore()
							update.mockRestore()
							remove.mockRestore()
						}
					})
					expect(observed.key).toBe(testCase.refusal)
					expect(observed.stagedAfter).toBe(observed.stagedBefore)
					expect(observed.operationsAfter).toEqual(observed.operationsBefore)
					expect(observed.addChildCalls).toBe(0)
					expect(observed.ensureChildCalls).toBe(0)
					expect(observed.deepCloneCalls).toBe(0)
					expect(observed.updateCalls).toBe(0)
					expect(observed.deleteCalls).toBe(0)
					const targetAfter = await target.query.getSnapshot({ as: 'xml' })
					const targetInfoAfter = await target.query.getDocumentInfo()
					expect(targetAfter).toBe(targetBefore)
					expect(targetInfoAfter).toEqual(targetInfoBefore)
					return { assertOn: 'target' }
				}

				const expectedWarnings = [
					{ code: 'supervision-left-out', source: { tagName: 'LN', id: 'omitted-supervision' } },
				]
				if (testCase.rollbackFirst) {
					const sentinel = new Error('test-owned rollback after supervision dependency cleanup')
					const rejection = await target
						.transaction(async function extractThenRollback(tx) {
							const result = await tx.lifecycle.extract.ied(params)
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
					return tx.lifecycle.extract.ied(params)
				})
				expect(result.warnings).toHaveLength(expectedWarnings.length)
				expect(result.warnings).toEqual(expect.arrayContaining(expectedWarnings))

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
				expect(nativeFcdas).toHaveLength((testCase.mixed ? 2 : 1) + (testCase.scoped ? 1 : 0))
				const dataSets = await target.query.getRecordsByTagName('DataSet')
				const nativeDataSets = dataSets.filter(function native(record) {
					return record.namespace.uri === nativeNamespace
				})
				expect(nativeDataSets).toHaveLength((testCase.mixed ? 2 : 1) + (testCase.scoped ? 1 : 0))
				const targetXml = await target.query.getSnapshot({ as: 'xml' })
				if (testCase.payload) {
					expect(targetXml.includes('affected dataset text')).toBe(testCase.mixed)
					expect(targetXml.includes('opaque data')).toBe(testCase.mixed)
				}
				for (const tag of controlTags) {
					const targetControls = await target.query.getRecordsByTagName(tag)
					const nativeControls = targetControls.filter(function native(record) {
						return record.namespace.uri === nativeNamespace
					})
					expect(nativeControls).toHaveLength(testCase.scoped ? 3 : 2)
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
									...(testCase.mixed ? {} : { datSet: undefined }),
									...(tag === 'LogControl'
										? { logEna: 'false' }
										: { confRev: String(Number(testCase.prior ?? '17') + 10000) }),
								},
							})
							const actual = semanticSubtree({ tree: targetCounterparts[0].record })
							expect(actual, identity).toEqual(expected)
							const associationAttribute = await target.query.getAttribute(control, {
								name: 'datSet',
								fullObject: true,
							})
							expect(associationAttribute?.value).toBe(testCase.mixed ? 'Events' : undefined)
							if (tag === 'LogControl') {
								const enabled = await target.query.getAttribute(control, { name: 'logEna' })
								expect(enabled).toBe('false')
								const attributes = await target.query.getAttributes(control)
								expect(attributes).not.toHaveProperty('confRev')
							} else {
								const revision = await target.query.getAttribute(control, { name: 'confRev' })
								expect(revision).toBe(String(Number(testCase.prior ?? '17') + 10000))
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
				const targetReport = await collectSclOutputViolations({ project, document: target })
				expect(targetReport.violations).toEqual([])
			} finally {
				const sourceAfter = await actualSource.query.getSnapshot({ as: 'xml' })
				const sourceInfoAfter = await actualSource.query.getDocumentInfo()
				expect(sourceAfter).toBe(sourceBefore)
				expect(sourceInfoAfter).toEqual(sourceInfoBefore)
			}
		} finally {
			if (preparedCounter) {
				await actualSource.transaction(async function restoreCounterBeforeOutputGates(tx) {
					await tx.update(preparedCounter, { attributes: { confRev: '17' } })
				})
				const restoredReport = await collectSclOutputViolations({ project, document: actualSource })
				expect(restoredReport.violations).toEqual([])
			}
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
