import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import twoInstancesXml from './fixtures/project-with-two-instances-of-a-breaker.xml?raw'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DiffNode } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { TakeOvers } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

// the template's breaker: its control model may be set by the project (its type says so), its select class may be
// imported by the IED (its DAI says so), its select timeout is read only
const templateXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-src" ${id}="xcbr-s">
							<DOI name="Pos" ${id}="pos-s">
								<DAI name="ctlModel" ${id}="ctl-dai-s"><Val ${id}="ctl-s">direct-with-normal-security</Val></DAI>
								<DAI name="sboClass" valImport="true" ${id}="cls-dai-s"><Val ${id}="cls-s">operate-many</Val></DAI>
								<DAI name="sboTimeout" ${id}="tmo-dai-s"><Val ${id}="tmo-s">30000</Val></DAI>
							</DOI>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"><DO name="Pos" type="DPC_T" ${id}="do-pos-s"/></LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dot-s">
				<DA name="ctlModel" fc="CF" bType="Enum" type="CtlModels" valKind="Set" ${id}="da-ctl-s"/>
				<DA name="sboClass" fc="CF" bType="Enum" type="SboClasses" valKind="RO" ${id}="da-cls-s"/>
				<DA name="sboTimeout" fc="CF" bType="INT32U" valKind="RO" ${id}="da-tmo-s"/>
			</DOType>
			<EnumType id="CtlModels" ${id}="en-ctl-s"><EnumVal ord="0" ${id}="ev0-s">status-only</EnumVal><EnumVal ord="1" ${id}="ev1-s">direct-with-normal-security</EnumVal></EnumType>
			<EnumType id="SboClasses" ${id}="en-cls-s"><EnumVal ord="0" ${id}="ev2-s">operate-once</EnumVal><EnumVal ord="1" ${id}="ev3-s">operate-many</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

// the newer template no longer allows the control model `status-only`
const templateNarrowedXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-src" ${id}="xcbr-s">
							<DOI name="Pos" ${id}="pos-s">
								<DAI name="ctlModel" ${id}="ctl-dai-s"><Val ${id}="ctl-s">direct-with-normal-security</Val></DAI>
								<DAI name="sboClass" valImport="true" ${id}="cls-dai-s"><Val ${id}="cls-s">operate-many</Val></DAI>
								<DAI name="sboTimeout" ${id}="tmo-dai-s"><Val ${id}="tmo-s">30000</Val></DAI>
							</DOI>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-s"><DO name="Pos" type="DPC_T" ${id}="do-pos-s"/></LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dot-s">
				<DA name="ctlModel" fc="CF" bType="Enum" type="CtlModels" valKind="Set" ${id}="da-ctl-s"/>
				<DA name="sboClass" fc="CF" bType="Enum" type="SboClasses" valKind="RO" ${id}="da-cls-s"/>
				<DA name="sboTimeout" fc="CF" bType="INT32U" valKind="RO" ${id}="da-tmo-s"/>
			</DOType>
			<EnumType id="CtlModels" ${id}="en-ctl-s"><EnumVal ord="1" ${id}="ev1-s">direct-with-normal-security</EnumVal></EnumType>
			<EnumType id="SboClasses" ${id}="en-cls-s"><EnumVal ord="0" ${id}="ev2-s">operate-once</EnumVal><EnumVal ord="1" ${id}="ev3-s">operate-many</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

// the instance, its IED renamed IED7: each of the three values set otherwise than the template's
const instanceXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t">
							<DOI name="Pos" ${id}="pos-t">
								<DAI name="ctlModel" ${id}="ctl-dai-t"><Val ${id}="ctl-t">status-only</Val></DAI>
								<DAI name="sboClass" valImport="true" ${id}="cls-dai-t"><Val ${id}="cls-t">operate-once</Val></DAI>
								<DAI name="sboTimeout" ${id}="tmo-dai-t"><Val ${id}="tmo-t">10000</Val></DAI>
							</DOI>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt1-t"><DO name="Pos" type="DPC_T" ${id}="do-pos-t"/></LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dot-t">
				<DA name="ctlModel" fc="CF" bType="Enum" type="CtlModels" valKind="Set" ${id}="da-ctl-t"/>
				<DA name="sboClass" fc="CF" bType="Enum" type="SboClasses" valKind="RO" ${id}="da-cls-t"/>
				<DA name="sboTimeout" fc="CF" bType="INT32U" valKind="RO" ${id}="da-tmo-t"/>
			</DOType>
			<EnumType id="CtlModels" ${id}="en-ctl-t"><EnumVal ord="0" ${id}="ev0-t">status-only</EnumVal><EnumVal ord="1" ${id}="ev1-t">direct-with-normal-security</EnumVal></EnumType>
			<EnumType id="SboClasses" ${id}="en-cls-t"><EnumVal ord="0" ${id}="ev2-t">operate-once</EnumVal><EnumVal ord="1" ${id}="ev3-t">operate-many</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

// the template's breaker read as its types say: an operate timeout and a pulse duration (in a structure) of no kind
// written, so of the default kind the project may set; a description its DAI makes read only; a pulse count of a read
// only kind the IED imports (`1`)
const templateKindsXml = /* xml */ `
	<SCL ${ns} ${id}="template">
		<IED name="TPL" uuid="ied-src" ${id}="ied-s">
			<AccessPoint name="AP1" uuid="ap-src" ${id}="ap-s">
				<Server ${id}="srv-s">
					<Authentication ${id}="auth-s"/>
					<LDevice inst="LD1" uuid="ld-src" ${id}="ld-s">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-src" ${id}="ln0-s"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_K" uuid="xcbr-src" ${id}="xcbr-s">
							<DOI name="Pos" ${id}="pos-s">
								<DAI name="operTimeout" ${id}="tmo-dai-s"><Val ${id}="otm-s">1000</Val></DAI>
								<DAI name="d" valKind="RO" ${id}="d-dai-s"><Val ${id}="d-s">Breaker</Val></DAI>
								<DAI name="pulseCount" valImport="1" ${id}="cnt-dai-s"><Val ${id}="cnt-s">2</Val></DAI>
								<SDI name="pulseConfig" ${id}="pls-s">
									<DAI name="onDur" ${id}="on-dai-s"><Val ${id}="on-s">100</Val></DAI>
								</SDI>
							</DOI>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-s"/>
			<LNodeType id="XCBR_K" lnClass="XCBR" ${id}="lnt1-s"><DO name="Pos" type="DPC_K" ${id}="do-pos-s"/></LNodeType>
			<DOType id="DPC_K" cdc="DPC" ${id}="dot-s">
				<DA name="operTimeout" fc="CF" bType="INT32U" ${id}="da-otm-s"/>
				<DA name="d" fc="DC" bType="VisString255" ${id}="da-d-s"/>
				<DA name="pulseCount" fc="CF" bType="INT32U" valKind="RO" ${id}="da-cnt-s"/>
				<DA name="pulseConfig" fc="CF" bType="Struct" type="PulseConfig_K" ${id}="da-pls-s"/>
			</DOType>
			<DAType id="PulseConfig_K" ${id}="dat-s"><BDA name="onDur" bType="INT32U" ${id}="bda-on-s"/></DAType>
		</DataTypeTemplates>
	</SCL>
`

// the instance: each of the four values set otherwise
const instanceKindsXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<IED name="IED7" uuid="ied-ins" templateUuid="ied-src" ${id}="ied-t">
			<AccessPoint name="AP1" uuid="ap-ins" templateUuid="ap-src" ${id}="ap-t">
				<Server ${id}="srv-t">
					<Authentication ${id}="auth-t"/>
					<LDevice inst="LD1" uuid="ld-ins" templateUuid="ld-src" ${id}="ld-t">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln0-ins" templateUuid="ln0-src" ${id}="ln0-t"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_K" uuid="xcbr-ins" templateUuid="xcbr-src" ${id}="xcbr-t">
							<DOI name="Pos" ${id}="pos-t">
								<DAI name="operTimeout" ${id}="tmo-dai-t"><Val ${id}="otm-t">2000</Val></DAI>
								<DAI name="d" valKind="RO" ${id}="d-dai-t"><Val ${id}="d-t">Feeder breaker</Val></DAI>
								<DAI name="pulseCount" valImport="1" ${id}="cnt-dai-t"><Val ${id}="cnt-t">5</Val></DAI>
								<SDI name="pulseConfig" ${id}="pls-t">
									<DAI name="onDur" ${id}="on-dai-t"><Val ${id}="on-t">200</Val></DAI>
								</SDI>
							</DOI>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-t">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lnt0-t"/>
			<LNodeType id="XCBR_K" lnClass="XCBR" ${id}="lnt1-t"><DO name="Pos" type="DPC_K" ${id}="do-pos-t"/></LNodeType>
			<DOType id="DPC_K" cdc="DPC" ${id}="dot-t">
				<DA name="operTimeout" fc="CF" bType="INT32U" ${id}="da-otm-t"/>
				<DA name="d" fc="DC" bType="VisString255" ${id}="da-d-t"/>
				<DA name="pulseCount" fc="CF" bType="INT32U" valKind="RO" ${id}="da-cnt-t"/>
				<DA name="pulseConfig" fc="CF" bType="Struct" type="PulseConfig_K" ${id}="da-pls-t"/>
			</DOType>
			<DAType id="PulseConfig_K" ${id}="dat-t"><BDA name="onDur" bType="INT32U" ${id}="bda-on-t"/></DAType>
		</DataTypeTemplates>
	</SCL>
`

const controlModelTakenOver: TakeOvers = [{ element: { tagName: 'Val', id: 'ctl-t' } }]
const firstIedTakenOver: TakeOvers = [{ element: { tagName: 'IED', id: 'ied-t' } }]

describe('diff of the values of an IED the project may set', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		takeOver?: TakeOvers
		/** The project's IED the template's is compared with (default `ied-t`). */
		instanceRootId?: string
		/**
		 * Each value kept, as `kept <tag>:<id> <reason> <project's> (template <template's>)`, then each decision group,
		 * as `<change> <tag>:<id> <suggested action>[ requires <reason>] [<companion ids>]`.
		 */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'values the template sets otherwise → kept where the project may set them, by its type or its import flag, the read-only one written':
			{
				sourceXml: templateXml,
				targetXml: instanceXml,
				expected: [
					'kept Val:cls-t settable-value operate-once (template operate-many)',
					'kept Val:ctl-t settable-value status-only (template direct-with-normal-security)',
					'modified Val:tmo-t accept []',
				],
			},
		"the control model taken over → listed as a change, the template's value suggested": {
			sourceXml: templateXml,
			targetXml: instanceXml,
			takeOver: controlModelTakenOver,
			expected: [
				'kept Val:cls-t settable-value operate-once (template operate-many)',
				'modified Val:ctl-t accept []',
				'modified Val:tmo-t accept []',
			],
		},
		"the project's control model no longer allowed by the template's type → a group of its own waiting for a decision":
			{
				sourceXml: templateNarrowedXml,
				targetXml: instanceXml,
				expected: [
					'kept Val:cls-t settable-value operate-once (template operate-many)',
					'modified LN:xcbr-t accept [tmo-t]',
					'modified Val:ctl-t skip requires value-outside-enumeration []',
				],
			},
		'kinds left out, a DAI overriding its type, an import flag written 1, a value in a structure → each read as the schema says':
			{
				sourceXml: templateKindsXml,
				targetXml: instanceKindsXml,
				expected: [
					'kept Val:cnt-t settable-value 5 (template 2)',
					'kept Val:on-t settable-value 200 (template 100)',
					'kept Val:otm-t settable-value 2000 (template 1000)',
					'modified Val:d-t accept []',
				],
			},
		'every value of the update taken over → each listed as a change': {
			sourceXml: templateXml,
			targetXml: instanceXml,
			takeOver: 'all',
			expected: [
				'modified Val:cls-t accept []',
				'modified Val:ctl-t accept []',
				'modified Val:tmo-t accept []',
			],
		},
		'one IED of two taken over, that IED compared → each of its values listed as a change': {
			sourceXml: templateXml,
			targetXml: twoInstancesXml,
			takeOver: firstIedTakenOver,
			expected: [
				'modified Val:cls-t accept []',
				'modified Val:ctl-t accept []',
				'modified Val:tmo-t accept []',
			],
		},
		"one IED of two taken over, the other compared → its values the project's": {
			sourceXml: templateXml,
			targetXml: twoInstancesXml,
			takeOver: firstIedTakenOver,
			instanceRootId: 'ied-u',
			expected: [
				'kept Val:cls-u settable-value operate-once (template operate-many)',
				'kept Val:ctl-u settable-value status-only (template direct-with-normal-security)',
				'modified Val:tmo-u accept []',
			],
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef: { tagName: 'IED', id: testCase.instanceRootId ?? instanceRootRef.id },
			diffPolicy: readDiffPolicy({ resolution: { takeOver: testCase.takeOver } }),
		})
		const kept = describeKept(report.root)
		const groups = report.groups.map(describeGroup)
		expect([...kept, ...groups].sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('reconcile of the values of an IED the project may set', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; takeOver?: TakeOvers }

	const testCases: SclTest.TestCases<TestCase> = {
		"the fast track → the project's settable values kept, the read-only one the template's": {
			sourceXml: templateXml,
			targetXml: instanceXml,
			expectedQueries: [
				'//default:DAI[@name="ctlModel"]/default:Val[.="status-only"]',
				'//default:DAI[@name="sboClass"]/default:Val[.="operate-once"]',
				'//default:DAI[@name="sboTimeout"]/default:Val[.="30000"]',
			],
		},
		"the control model taken over, the fast track → the template's control model written": {
			sourceXml: templateXml,
			targetXml: instanceXml,
			takeOver: controlModelTakenOver,
			expectedQueries: [
				'//default:DAI[@name="ctlModel"]/default:Val[.="direct-with-normal-security"]',
				'//default:DAI[@name="sboClass"]/default:Val[.="operate-once"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function reconcileInstance(tx) {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
				takeOver: testCase.takeOver,
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Every value the tree lists as kept: `kept <tag>:<id> <reason> <project's> (template <template's>)`. */
function describeKept(node: DiffNode): string[] {
	const own = node.keptTextChange
		? [
				`kept ${node.tagName}:${node.instanceRef?.id} ${node.keptTextChange.reason} ${node.keptTextChange.before} (template ${node.keptTextChange.after})`,
			]
		: []
	return [...own, ...node.children.flatMap(describeKept)]
}

/** A decision group as `<change> <tag>:<id> <suggested action>[ requires <reason>] [<companion ids>]`. */
function describeGroup(group: DecisionGroup): string {
	const primary = group.primary.instanceRef ?? group.primary.sourceRef
	const requires = group.requiresDecision ? ` requires ${group.requiresDecision}` : ''
	const companions = group.companions.map(
		(companion) => companion.instanceRef?.id ?? companion.sourceRef?.id,
	)
	return `${group.change} ${group.primary.tagName}:${primary?.id} ${group.suggestedAction}${requires} [${companions.join(', ')}]`
}
