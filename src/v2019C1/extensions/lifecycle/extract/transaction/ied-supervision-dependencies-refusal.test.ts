/// <reference types="vite/client" />

import SelectedIedWithValidAffectedCountersXml from './fixtures/selected-ied-with-valid-affected-counters.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const emptyTarget = /* xml */ `<SCL ${ns}/>`

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }
type AffectedCounter = Scl.Ref<'ReportControl' | 'GSEControl' | 'SampledValueControl'>
type MissingCounterTestCase = TestCase & { counter: AffectedCounter }
type InvalidCounterTestCase = MissingCounterTestCase & { value: string }
type SourceDocument = SclTest.ActParams<TestCase>['source']
type TargetDocument = NonNullable<SclTest.ActParams<TestCase>['target']>

const affectedReport = { tagName: 'ReportControl', id: 'affected-report' } as AffectedCounter
const affectedGoose = { tagName: 'GSEControl', id: 'affected-goose' } as AffectedCounter
const affectedSamples = {
	tagName: 'SampledValueControl',
	id: 'affected-samples',
} as AffectedCounter

/** The extraction refused with its key, nothing staged, the target as it was. */
async function expectRefusedBeforeAnyWrite(params: {
	actualSource: SourceDocument
	target: TargetDocument
	refusal: 'EXTRACTION_CONF_REV_INVALID' | 'EXTRACTION_CONF_REV_OVERFLOW'
}): Promise<void> {
	const { actualSource, target, refusal } = params
	const targetBefore = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
	const outcome = await target.transaction(async function exportIsd(tx) {
		const stagedBefore = [...tx.getStagedOperations()]
		const refused = await tx.lifecycle.extract
			.ied({
				sourceQuery: actualSource.query,
				iedRef: { tagName: 'IED', id: 'selected-ied' },
				fileType: 'ISD',
				kind: 'instance',
				inputs: 'none',
				issuer: 'TEST_ISSUER',
				tool: 'TEST',
				who: 'test',
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
	})
	expect(toDialecteError(outcome.refused)?.key).toBe(refusal)
	expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
	const targetAfter = await target.query.getSnapshot({ as: 'tree', unwrap: [] })
	expect(targetAfter).toEqual(targetBefore)
}

/** One affected counter broken through the store, the extraction refused, and the counter valid again. */
async function expectBrokenCounterRefused(params: {
	act: SclTest.ActParams<TestCase>
	counter: AffectedCounter
	brokenValue: string | undefined
	breakCounter: (tx: Scl.Transaction) => Promise<void>
}): Promise<void> {
	const { act, counter, brokenValue, breakCounter } = params
	const { source, target } = act
	if (!target) throw new Error('target required')
	await source.transaction(breakCounter)
	const actual = await source.query.getAttribute(counter, { name: 'confRev', fullObject: true })
	expect(actual?.value).toBe(brokenValue)

	await expectRefusedBeforeAnyWrite({
		actualSource: source,
		target,
		refusal: 'EXTRACTION_CONF_REV_INVALID',
	})

	// the output gate reads this document after the case: it gets a valid counter back
	await source.transaction(async function restoreCounterBeforeOutputGates(tx) {
		await tx.update(counter, { attributes: { confRev: '17' } })
	})
}

describe('extract IED supervision dependencies: counters that refuse the extraction', () => {
	describe('counter that would overflow', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'affected counter one past the highest value that can still grow → refused before any write, no reset or wrap':
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
												<ReportControl name="ReportAffected" datSet="Events" confRev="4294957296">
													<OptFields/>
												</ReportControl>
												<LogControl name="LogAffected" datSet="Events" logName="EventsLog" logEna="true">
													<TrgOps dchg="true"/>
												</LogControl>
												<GSEControl name="GooseAffected" datSet="Events" appID="EventsAffected" confRev="4294957296"/>
												<SampledValueControl name="SamplesAffected" datSet="Events" smvID="EventsAffected" smpRate="80" nofASDU="1" confRev="4294957296">
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
				},
		}

		async function act(params: SclTest.ActParams<TestCase>): Promise<void> {
			const { source, target } = params
			if (!target) throw new Error('target required')
			await expectRefusedBeforeAnyWrite({
				actualSource: source,
				target,
				refusal: 'EXTRACTION_CONF_REV_OVERFLOW',
			})
		}

		runSclTestCases.withoutExport({ testCases, act })
	})

	describe('counter missing', () => {
		const testCases: SclTest.TestCases<MissingCounterTestCase> = {
			'affected GSEControl without confRev → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedGoose,
			},
			'affected SampledValueControl without confRev → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedSamples,
			},
			'affected ReportControl without confRev → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedReport,
			},
		}

		async function act(params: SclTest.ActParams<MissingCounterTestCase>): Promise<void> {
			const { counter } = params.testCase
			await expectBrokenCounterRefused({
				act: params,
				counter,
				brokenValue: undefined,
				breakCounter: async function removeCounter(tx) {
					await tx.update(counter, { attributes: { confRev: undefined } })
				},
			})
		}

		runSclTestCases.withoutExport({ testCases, act })
	})

	describe('counter invalid', () => {
		const testCases: SclTest.TestCases<InvalidCounterTestCase> = {
			'affected ReportControl with a confRev that is no number → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedReport,
				value: 'not-a-number',
			},
			'affected GSEControl with a negative confRev → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedGoose,
				value: '-1',
			},
			'affected SampledValueControl with a confRev above uint32 → refused without a zero default': {
				sourceXml: SelectedIedWithValidAffectedCountersXml,
				targetXml: emptyTarget,
				counter: affectedSamples,
				value: '4294967296',
			},
		}

		async function act(params: SclTest.ActParams<InvalidCounterTestCase>): Promise<void> {
			const { counter, value } = params.testCase
			await expectBrokenCounterRefused({
				act: params,
				counter,
				brokenValue: value,
				breakCounter: async function writeInvalidCounter(tx) {
					await tx.any.update(counter, { attributes: { confRev: value } })
				},
			})
		}

		runSclTestCases.withoutExport({ testCases, act })
	})
})
