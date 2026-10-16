import { expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE } from '@/v2019C1/test'

import type { Dataflow, SpecifiedDataflow } from '../../dataflow.types'
import type {
	ExpectedDataflow,
	ExpectedEntry,
	ScdSlots,
	SignalSide,
	Implementation,
	Specification,
} from './dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

export const SENDER_LNODE =
	'iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="uuid-ptrc" uuid="uuid-lnode-sender"'
/** A sender's LNode mapped to the logical node `GGIO1` of `B1`, beside the receiver's. */
export const SENDER_LNODE_IN_B1 =
	'iedName="B1" ldInst="LD0" lnClass="GGIO" lnInst="1" lnUuid="uuid-ggio" uuid="uuid-lnode-sender"'

/** The sender's LNode without a uuid: only its path can name it. */
export const SENDER_LNODE_WITHOUT_UUID =
	'iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" lnUuid="uuid-ptrc"'
/** A process resource of the function, named `PR1`. */
export const PROCESS_RESOURCE = /* xml */ `
	<eIEC61850-6-100:ProcessResources ${id}="process-resources">
		<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-pr1" ${id}="process-resource"/>
	</eIEC61850-6-100:ProcessResources>
`

/** The `LNodeSpecNaming` of the sender's LNode, as a file assigning it to an IED carries. */
export const SENDER_SPEC_NAMING = /* xml */ `<eIEC61850-6-100:LNodeSpecNaming sLdInst="LD0" sLnClass="PTRC" sLnInst="1" ${id}="spec-naming-sender"/>`

/** A second LNode of the sender's path, to tell the last of a path from the first. */
export const DUPLICATE_SENDER_LNODE = `<LNode ${SENDER_LNODE_WITHOUT_UUID} ${id}="lnode-sender-duplicate"/>`

export const RECEIVER_LNODE =
	'iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="uuid-xcbr" uuid="uuid-lnode-receiver"'

/** A function template whose LNode, assigned to no IED, holds a SourceRef given by `attributes`. */
export function functionTemplateWithSourceRef(attributes = ''): string {
	return /* xml */ `
		<eIEC61850-6-100:FunctionTemplate name="FT1" ${id}="function-template">
			<eIEC61850-6-100:LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="lnode-template">
				${sourceRef(attributes, 'source-ref-template')}
			</eIEC61850-6-100:LNode>
		</eIEC61850-6-100:FunctionTemplate>
	`
}

/** An ExtRef written in full: its signal, its control block and where it lands in `B1`. */
export const BOUND_EXT_REF =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" srcLDInst="LD0" srcCBName="gcb1" serviceType="GOOSE"'

/** An ExtRef naming its signal and the control block publishing it, without an internal address: subscribed. */
export function subscribedExtRef(uuid = 'uuid-ext-ref'): string {
	return `uuid="${uuid}" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="GOOSE" srcLDInst="LD0" srcCBName="gcb1"`
}

export const SUBSCRIBED_EXT_REF = subscribedExtRef()

/** An IED `B2` whose logical node `XCBR1` holds an ExtRef, given by `attributes`. */
export function iedB2WithExtRef(attributes: string): string {
	return /* xml */ `
		<IED name="B2" ${id}="ied-b2">
			<AccessPoint name="AP1" ${id}="ap-b2">
				<Server ${id}="server-b2">
					<Authentication ${id}="authentication-b2"/>
					<LDevice inst="LD0" ${id}="ld-b2">
						<LN0 lnClass="LLN0" inst="" lnType="T0" uuid="uuid-ln0-b2" ${id}="ln0-b2"/>
						<LN lnClass="XCBR" inst="1" lnType="T1" uuid="uuid-xcbr-b2" ${id}="ln-xcbr-b2">
							<Inputs ${id}="inputs-b2"><ExtRef ${attributes} ${id}="ext-ref-b2"/></Inputs>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	`
}

/** The inputs of `P1`'s logical node `PTRC1`, holding an ExtRef given by `attributes`. */
export function ptrcInputsWithExtRef(attributes: string): string {
	return /* xml */ `<Inputs ${id}="inputs-ptrc"><ExtRef ${attributes} ${id}="ext-ref"/></Inputs>`
}

/** An ExtRef naming a signal of `P1` and no control block: it lands in `B1`, and is polled when it has a service. */
export const EXT_REF_WITHOUT_CONTROL_BLOCK =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op"'

/** An ExtRef polling a signal of `P1`. */
export const POLL_EXT_REF = `${EXT_REF_WITHOUT_CONTROL_BLOCK} serviceType="Poll"`

/** An ExtRef subscribing to the report control block `rcb1` held by the logical node `PTRC1` of `P1`. */
export const EXT_REF_BY_REPORT_IN_LN =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="Report" srcLDInst="LD0" srcLNClass="PTRC" srcLNInst="1" srcCBName="rcb1"'

/** An ExtCtrl controlling data of the logical node `GGIO1` of `B1`. */
export const EXT_CTRL_ON_GGIO_OF_B1 =
	'uuid="uuid-ext-ctrl" intAddr="Close" iedName="B1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Op"'

/** An ExtRef subscribing to the report control block `rcb1`. */
export const EXT_REF_BY_REPORT =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="Report" srcLDInst="LD0" srcCBName="rcb1"'

/** An ExtRef naming its control block by uuid alone. */
export const EXT_REF_BY_CONTROL_BLOCK_UUID =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="GOOSE" srcCBUuid="uuid-gcb1"'

/** An ExtRef naming its control block by its names alone: logical device and name, GOOSE. */
export const EXT_REF_BY_CONTROL_BLOCK_NAMES =
	'uuid="uuid-ext-ref" intAddr="Trip" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" serviceType="GOOSE" srcLDInst="LD0" srcCBName="gcb1"'

/** Two ExtRefs of one logical node sharing the internal address `Trip`, told apart by their data attribute. */
export const SHARED_ADDRESS_EXT_REFS = [
	{ id: 'ext-ref-stval', attributes: 'intAddr="Trip" pDA="stVal"' },
	{ id: 'ext-ref-q', attributes: 'intAddr="Trip" pDA="q"' },
]

/** An ExtRef without a uuid, so only its address can name it. */
export const UNBOUND_EXT_REF = 'intAddr="Trip"'

/** LNode attributes left to name their logical node by names alone: no `lnUuid`. */
export function withoutLnUuid(attributes: string): string {
	return attributes.replace(/ lnUuid="[^"]*"/, '')
}

export function sourceRef(attributes = '', signalId = 'source-ref'): string {
	return /* xml */ `<eIEC61850-6-100:LNodeInputs ${id}="inputs-${signalId}"><eIEC61850-6-100:SourceRef input="Trip" ${attributes} ${id}="${signalId}"/></eIEC61850-6-100:LNodeInputs>`
}

/** Several SourceRefs of one LNode, in one `LNodeInputs`, each with its own id and attributes. */
export function sourceRefs(signals: readonly { id: string; attributes: string }[]): string {
	return /* xml */ `<eIEC61850-6-100:LNodeInputs ${id}="inputs-shared">${signals
		.map(
			(signal) =>
				`<eIEC61850-6-100:SourceRef input="Trip" ${signal.attributes} ${id}="${signal.id}"/>`,
		)
		.join('')}</eIEC61850-6-100:LNodeInputs>`
}

export function controlRef(attributes = ''): string {
	return /* xml */ `<eIEC61850-6-100:LNodeOutputs ${id}="outputs"><eIEC61850-6-100:ControlRef output="Close" ${attributes} ${id}="control-ref"/></eIEC61850-6-100:LNodeOutputs>`
}

/** A logical node of `B1` holding an ExtRef (when `extRef` is given) in its inputs. */
export function logicalNodeWithExtRef(params: {
	lnClass: string
	lnId: string
	uuid?: string
	extRef?: string
	extRefId?: string
}): string {
	const { lnClass, lnId, uuid, extRef, extRefId = 'ext-ref' } = params
	return /* xml */ `
		<LN lnClass="${lnClass}" inst="1" lnType="T1" ${uuid ? `uuid="${uuid}"` : ''} ${id}="${lnId}">
			${extRef ? `<Inputs ${id}="inputs-${lnId}"><ExtRef ${extRef} ${id}="${extRefId}"/></Inputs>` : ''}
		</LN>
	`
}

export function xcbrWithExtRef(attributes?: string): string {
	return logicalNodeWithExtRef({
		lnClass: 'XCBR',
		lnId: 'ln-xcbr',
		uuid: 'uuid-xcbr',
		extRef: attributes,
	})
}

/** The logical node `XCBR1` of `B1` holding several ExtRefs in its inputs, each with its own id. */
export function xcbrWithExtRefs(extRefs: readonly { id: string; attributes: string }[]): string {
	return /* xml */ `
		<LN lnClass="XCBR" inst="1" lnType="T1" uuid="uuid-xcbr" ${id}="ln-xcbr">
			<Inputs ${id}="inputs-ln-xcbr">
				${extRefs.map((extRef) => `<ExtRef ${extRef.attributes} ${id}="${extRef.id}"/>`).join('')}
			</Inputs>
		</LN>
	`
}

/** The logical node `XCBR1` of `B1` holding an ExtCtrl in its outputs. */
export function xcbrWithExtCtrl(attributes: string): string {
	return /* xml */ `
		<LN lnClass="XCBR" inst="1" lnType="T1" uuid="uuid-xcbr" ${id}="ln-xcbr">
			<Outputs ${id}="outputs-xcbr"><ExtCtrl ${attributes} ${id}="ext-ctrl"/></Outputs>
		</LN>
	`
}

/** An ExtCtrl written in full: the signal it controls and where it starts from in `B1`. */
export const BOUND_EXT_CTRL =
	'uuid="uuid-ext-ctrl" intAddr="Close" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op"'

/** An ExtCtrl without a uuid, written in full otherwise, so only its address can name it. */
export const UNBOUND_EXT_CTRL =
	'intAddr="Close" iedName="P1" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op"'

/** A proxy logical node of `B1`, holding the ExtRef the receiver's LNode is implemented by. */
export function ggioWithExtRef(attributes: string, extRefId?: string): string {
	return logicalNodeWithExtRef({ lnClass: 'GGIO', lnId: 'ln-ggio', extRef: attributes, extRefId })
}

export function gooseControlBlock(registrations = IED_NAME_B1): string {
	return /* xml */ `
		<GSEControl name="gcb1" datSet="DS1" appID="app1" uuid="uuid-gcb1" ${id}="gcb1">
			${registrations}
		</GSEControl>
	`
}

/** The `IEDName` naming `B1`, down to the attributes given (logical device, logical node). */
export function iedNameB1(attributes = ''): string {
	return /* xml */ `<IEDName apRef="AP1" ${attributes} ${id}="iedname-b1">B1</IEDName>`
}

/** The `IEDName` naming `B1` and the access point `apRef`, by its uuid. */
export function iedNameB1ByAccessPoint(params: { apRef: string; apUuid: string }): string {
	return /* xml */ `<IEDName apRef="${params.apRef}" apUuid="${params.apUuid}" ${id}="iedname-b1">B1</IEDName>`
}

/** A second access point of `B1`, holding nothing. */
export const SECOND_ACCESS_POINT_OF_B1 = /* xml */ `<AccessPoint name="AP2" uuid="uuid-ap2-b1" ${id}="ap2-b1"/>`

export const IED_NAME_B1 = iedNameB1()

export const IED_NAME_B2 = /* xml */ `<IEDName apRef="AP1" ${id}="iedname-b2">B2</IEDName>`

export const GOOSE_CONTROL_BLOCK = gooseControlBlock()

/** A report control block whose client is the logical node `XCBR1` of `B1`. */
export const REPORT_CONTROL_BLOCK = /* xml */ `
	<ReportControl name="rcb1" rptID="rpt1" confRev="1" datSet="DS1" buffered="true" uuid="uuid-rcb1" ${id}="rcb1">
		<TrgOps dchg="true" ${id}="trgops"/>
		<OptFields ${id}="optfields"/>
		<RptEnabled max="1" ${id}="rpt-enabled">
			<ClientLN iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" apRef="AP1" ${id}="client-ln-b1"/>
		</RptEnabled>
	</ReportControl>
`

/** A report control block `rcb1` whose registration is the `ClientLN` given. */
export function reportControlBlockWith(clientLn: string): string {
	return /* xml */ `
		<ReportControl name="rcb1" rptID="rpt1" confRev="1" datSet="DS1" buffered="true" uuid="uuid-rcb1" ${id}="rcb1">
			<TrgOps dchg="true" ${id}="trgops"/>
			<OptFields ${id}="optfields"/>
			<RptEnabled max="1" ${id}="rpt-enabled">${clientLn}</RptEnabled>
		</ReportControl>
	`
}

/** The `ClientLN` naming the logical node `IHMI1` held by `B1`'s access point: no logical device, `ldInst` is a placeholder. */
export const CLIENT_LN_IHMI_OF_B1 = /* xml */ `<ClientLN iedName="B1" apRef="AP1" ldInst="none" lnClass="IHMI" lnInst="1" ${id}="client-ln-b1"/>`

/** A client logical node `IHMI1` held directly by `B1`'s access point, with an ExtRef given by `attributes`. */
export function ihmiOfAccessPointWithExtRef(attributes: string): string {
	return logicalNodeWithExtRef({
		lnClass: 'IHMI',
		lnId: 'ln-ihmi',
		extRef: attributes,
	})
}

/** A GOOSE control block `gcb2` held by `B1`, naming no subscriber. */
export const GOOSE_CONTROL_BLOCK_IN_B1 = /* xml */ `<GSEControl name="gcb2" appID="app2" uuid="uuid-gcb2" ${id}="gcb2"/>`

/** A GOOSE and a report control block of one name. */
export const SHARED_NAME_CONTROL_BLOCKS = /* xml */ `
	<ReportControl name="shared" rptID="rpt1" confRev="1" datSet="DS1" buffered="true" ${id}="rcb-shared">
		<TrgOps dchg="true" ${id}="trgops-shared"/>
		<OptFields ${id}="optfields-shared"/>
		<RptEnabled max="1" ${id}="rpt-enabled-shared"/>
	</ReportControl>
	<GSEControl name="shared" datSet="DS1" appID="app1" ${id}="gcb-shared"/>
`

/** The control block without a uuid: only its names can name it. */
export const GOOSE_CONTROL_BLOCK_WITHOUT_UUID = GOOSE_CONTROL_BLOCK.replace(' uuid="uuid-gcb1"', '')

export function buildScd(slots: ScdSlots = {}): string {
	const {
		senderLNode = SENDER_LNODE,
		senderContent = '',
		receiverLNode = RECEIVER_LNODE,
		signals = '',
		receiverLogicalNodes = xcbrWithExtRef('intAddr="Trip"'),
		controlBlocks = GOOSE_CONTROL_BLOCK,
		senderLogicalNodeContent = '',
		receiverControlBlocks = '',
		receiverAccessPointContent = '',
		receiverAccessPoints = '',
		extraIeds = '',
		templates = '',
		functionExtras = '',
	} = slots
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<Function name="F1" ${id}="function">
					<LNode ${senderLNode} ${id}="lnode-sender">${senderContent}</LNode>
					<LNode ${receiverLNode} ${id}="lnode-receiver">
						${signals}
					</LNode>
					${functionExtras}
				</Function>
			</Substation>
			${templates}
			<IED name="P1" ${id}="ied-p1">
				<AccessPoint name="AP1" ${id}="ap-p1">
					<Server ${id}="server-p1">
						<Authentication ${id}="authentication-p1"/>
						<LDevice inst="LD0" ${id}="ld-p1">
							<LN0 lnClass="LLN0" inst="" lnType="T0" uuid="uuid-ln0-p1" ${id}="ln0-p1">
								<DataSet name="DS1" ${id}="ds1">
									<FCDA ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Op" fc="ST" ${id}="fcda1"/>
								</DataSet>
								${controlBlocks}
							</LN0>
							<LN lnClass="PTRC" inst="1" lnType="T2" uuid="uuid-ptrc" ${id}="ln-ptrc">${senderLogicalNodeContent}</LN>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
			<IED name="B1" ${id}="ied-b1">
				<AccessPoint name="AP1" uuid="uuid-ap1-b1" ${id}="ap-b1">
					<Server ${id}="server-b1">
						<Authentication ${id}="authentication-b1"/>
						<LDevice inst="LD0" uuid="uuid-ld-b1" ${id}="ld-b1">
							<LN0 lnClass="LLN0" inst="" lnType="T0" uuid="uuid-ln0-b1" ${id}="ln0-b1">${receiverControlBlocks}</LN0>
							${receiverLogicalNodes}
						</LDevice>
					</Server>
					${receiverAccessPointContent}
				</AccessPoint>
				${receiverAccessPoints}
			</IED>
			${extraIeds}
		</SCL>
	`
}

// ── Refs of the fixture ──────────────────────────────────────────────

export const REFS = {
	sourceRef: { tagName: 'SourceRef', id: 'source-ref' },
	templateSourceRef: { tagName: 'SourceRef', id: 'source-ref-template' },
	templateLNode: { tagName: 'LNode', id: 'lnode-template' },
	controlRef: { tagName: 'ControlRef', id: 'control-ref' },
	senderLNode: { tagName: 'LNode', id: 'lnode-sender' },
	duplicateSenderLNode: { tagName: 'LNode', id: 'lnode-sender-duplicate' },
	receiverLNode: { tagName: 'LNode', id: 'lnode-receiver' },
	extRef: { tagName: 'ExtRef', id: 'ext-ref' },
	extCtrl: { tagName: 'ExtCtrl', id: 'ext-ctrl' },
	xcbr: { tagName: 'LN', id: 'ln-xcbr' },
	ggio: { tagName: 'LN', id: 'ln-ggio' },
	iedB1: { tagName: 'IED', id: 'ied-b1' },
	ldB1: { tagName: 'LDevice', id: 'ld-b1' },
	iedP1: { tagName: 'IED', id: 'ied-p1' },
	iedB2: { tagName: 'IED', id: 'ied-b2' },
	gcb1: { tagName: 'GSEControl', id: 'gcb1' },
	gcb2: { tagName: 'GSEControl', id: 'gcb2' },
	rcb1: { tagName: 'ReportControl', id: 'rcb1' },
	clientLnB1: { tagName: 'ClientLN', id: 'client-ln-b1' },
	iedNameB1: { tagName: 'IEDName', id: 'iedname-b1' },
	iedNameB2: { tagName: 'IEDName', id: 'iedname-b2' },
	extRefB2: { tagName: 'ExtRef', id: 'ext-ref-b2' },
} as const satisfies Record<string, Scl.Ref<Scl.ElementsOf>>

// ── Expected shapes ──────────────────────────────────────────────────

/** What a signal that no ExtRef / ExtCtrl implements reads: every fact open. */
export const NOT_IMPLEMENTED: Implementation = {
	state: 'unimplemented',
	element: undefined,
	binding: undefined,
	ln: undefined,
	ied: undefined,
	controlBlock: undefined,
	publisher: undefined,
	registration: undefined,
	dangling: [],
}

/** The IEDs of a signal whose receiver is implemented in `B1` and whose sender is in `P1`. */
export const MAPPED_INTO_B1_AND_P1: Specification['mappedIeds'] = {
	holder: REFS.iedB1,
	other: REFS.iedP1,
}

/** The IEDs of a signal whose two LNodes are implemented in `B1`. */
export const MAPPED_INTO_B1_ONLY: Specification['mappedIeds'] = {
	holder: REFS.iedB1,
	other: REFS.iedB1,
}

/** The signal side of a dataflow, as every case reads it: what the signal says about itself. */
export function signalSide(dataflow: SpecifiedDataflow): SignalSide {
	const { signal, direction, specification } = dataflow
	return { signal, direction, specification }
}

/** The expected signal side of a signal of the receiver's LNode, its specification given in part. */
export function expectedSignalSide(params: {
	signal: SpecifiedDataflow['signal']
	direction: SpecifiedDataflow['direction']
	specification: Partial<Specification>
}): SignalSide {
	const { signal, direction, specification } = params
	return {
		signal,
		direction,
		specification: {
			state: 'open',
			service: undefined,
			holder: REFS.receiverLNode,
			other: undefined,
			allocation: 'unallocated',
			mappedIeds: { holder: REFS.iedB1, other: undefined },
			...specification,
		},
	}
}

/** The values of `actual` under the keys of `expected`: the projection a case asserts on. */
export function projectOnto<GenericObject extends object>(
	actual: GenericObject,
	expected: Partial<GenericObject>,
): Partial<GenericObject> {
	return Object.fromEntries(
		Object.keys(expected).map((key) => [key, actual[key as keyof GenericObject]]),
	) as Partial<GenericObject>
}

/** Asserts the parts of a dataflow a case expects, the rest left unchecked. */
export function assertDataflow(params: {
	dataflow: SpecifiedDataflow
	expected: ExpectedDataflow
}): void {
	const { dataflow, expected } = params
	if (expected.expectedSignalSide) {
		expect(signalSide(dataflow)).toEqual(expected.expectedSignalSide)
	}
	if (expected.expectedImplementation) {
		expect(projectOnto(dataflow.implementation, expected.expectedImplementation)).toEqual(
			expected.expectedImplementation,
		)
	}
}

/** The element implementing a dataflow, whatever its kind. */
function elementOf(dataflow: Dataflow): Scl.Ref<'ExtRef' | 'ExtCtrl'> | undefined {
	return dataflow.kind === 'implementation-only'
		? dataflow.element
		: dataflow.implementation.element
}

/** The parts of a dataflow that an expected entry names. */
function projectEntry(params: { dataflow: Dataflow; expected: ExpectedEntry }): ExpectedEntry {
	const { dataflow, expected } = params
	return {
		kind: dataflow.kind,
		...('signal' in expected
			? { signal: dataflow.kind === 'specified' ? dataflow.signal : undefined }
			: {}),
		...('element' in expected ? { element: elementOf(dataflow) } : {}),
		...(expected.implementation
			? { implementation: projectOnto(dataflow.implementation, expected.implementation) }
			: {}),
	}
}

/** Asserts a list of dataflows, entry by entry in order: as many as expected, each as far as it names. */
export function assertDataflows(params: {
	dataflows: readonly Dataflow[]
	expected: readonly ExpectedEntry[]
}): void {
	const { dataflows, expected } = params
	expect(
		dataflows.map((dataflow, index) =>
			projectEntry({ dataflow, expected: expected[index] ?? { kind: dataflow.kind } }),
		),
	).toEqual(expected)
}
