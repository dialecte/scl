import type { Scl } from '@/v2019C1/config'
import type { ResolutionType } from '@/v2019C1/extensions/reference'

/**
 * How completely an `ExtRef` (an input of a logical node) is written, from the most complete down:
 * - `bound`: it names the signal it receives, the control block publishing it (when its service
 *   needs one) and the internal address it lands on in the receiving device;
 * - `subscribed`: it names the signal and the control block publishing it (when its service needs
 *   one), and lands nowhere yet;
 * - `expected`: it names the signal, but no service, or no control block although its service needs
 *   one; an internal address alone is never read as a binding;
 * - `later-binding`: it names no signal, only the internal address it will land on;
 * - `empty`: it names neither.
 *
 * A signal is named once its logical node is named, by its uuid or by its IED, logical device and
 * logical node class (a uuid naming the element stands for its names), and its data object is given.
 * The service must be set for `subscribed` and `bound`: without one the ExtRef stays `expected`
 * whatever else it names. A service published without a control block (polling) needs none; the
 * others need the control block named, by its uuid or by its name.
 */
export type ExtRefState = 'empty' | 'later-binding' | 'expected' | 'subscribed' | 'bound'

/**
 * How completely an `ExtCtrl` (an output of a logical node) is written, the same ladder as an
 * `ExtRef` without its control block:
 * - `bound`: it names the signal it controls and the internal address it starts from;
 * - `expected`: it names the signal, without internal address;
 * - `later-binding`: it names no signal, only the internal address;
 * - `empty`: it names neither.
 */
export type ExtCtrlState = 'empty' | 'later-binding' | 'expected' | 'bound'

/**
 * The attributes through which an `ExtRef` / `ExtCtrl` names its signal: the logical node is named
 * once `uuid` is set or all of `names` are; the signal once `data` is set as well.
 */
export type SignalAttributes = {
	uuid: string
	names: readonly string[]
	data: string
}

/**
 * The attributes through which an `ExtRef` names its control block: it is named once one of `names`
 * is set; `serviceAttribute` holds the service, and only the values in `servicesWithControlBlock`
 * are published by a control block.
 */
export type ControlBlockAttributes = {
	names: readonly string[]
	serviceAttribute: string
	servicesWithControlBlock: ReadonlySet<string>
}

/**
 * A dataflow of the document: one signal of the specification (a SourceRef taking data from
 * another logical node, a ControlRef controlling data of one) with what implements it, or an ExtRef
 * implemented without any signal.
 */
export type Dataflow = SpecifiedDataflow | ImplementationOnlyDataflow

export type SpecifiedDataflow = {
	kind: 'specified'
	signal: Scl.Ref<'SourceRef' | 'ControlRef'>
	/** `input` for a SourceRef (an input of its logical node), `output` for a ControlRef. */
	direction: 'input' | 'output'
	/** What the signal says, read from the signal alone. */
	specification: {
		/** `connected` once the other logical node is named, by path or by uuid. */
		state: 'open' | 'connected'
		/** The service the signal asks for, as written; an output has none. */
		service: string | undefined
		/** The logical node holding the signal: the subscriber of an input, the controller of an output. */
		holder: Scl.Ref<'LNode'>
		/**
		 * The other logical node and the data it provides: `doName` and `daName` are absent when the
		 * signal gives none; `undefined` while no logical node is named, or it names nothing.
		 */
		other: { lnode: Scl.Ref<'LNode'>; doName?: string; daName?: string } | undefined
		/**
		 * Where the two logical nodes are implemented: both in one IED (`same-ied`), in two
		 * (`inter-ied`), or one of them is not mapped to a logical node (`unallocated`). Never read
		 * from the service.
		 */
		allocation: 'same-ied' | 'inter-ied' | 'unallocated'
	}
	/**
	 * What implements the signal. Whether it is implemented never depends on the control block: the
	 * control block, its publisher and the registration are facts beside it.
	 */
	implementation: {
		/** `implemented` once the signal names its ExtRef / ExtCtrl, by address or by uuid. */
		state: 'unimplemented' | 'implemented'
		/** The element the address or the uuid names; `undefined` while none is named, or it names nothing. */
		element: Scl.Ref<'ExtRef' | 'ExtCtrl'> | undefined
		/** How completely the element is written; `undefined` without an element. */
		binding: ExtRefState | ExtCtrlState | undefined
		/** The logical node holding the element. */
		ln: Scl.Ref<'LN' | 'LN0'> | undefined
		/** The IED holding the element: the subscriber of an input, the controller of an output. */
		ied: Scl.Ref<'IED'> | undefined
		/** The control block the ExtRef names, by uuid or by its names. */
		controlBlock: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'> | undefined
		/** The IED holding that control block. */
		publisher: Scl.Ref<'IED'> | undefined
		/** The subscriber's entry on that control block, when it has one. */
		registration: Registration | undefined
		/**
		 * Every uuid and every address of the signal, and every uuid of its element, that names nothing
		 * in the document. An address fitting several elements without telling them apart is not one.
		 */
		dangling: readonly DanglingLink[]
	}
}

/** An ExtRef naming a control block that no signal of the specification links to. */
export type ImplementationOnlyDataflow = {
	kind: 'implementation-only'
	element: Scl.Ref<'ExtRef'>
	implementation: SpecifiedDataflow['implementation']
}

/**
 * The subscriber's own entry on a control block (an `IEDName`, or a `ClientLN` of a report), and
 * how precisely it names the subscriber: its IED only, also its logical device, or its logical node.
 */
export type Registration = {
	element: Scl.Ref<'IEDName' | 'ClientLN'>
	names: 'ied' | 'ld' | 'ln'
}

/** A uuid or an address naming nothing in the document: the attribute holding it, on which element. */
export type DanglingLink = {
	element: Scl.Ref<Scl.ElementsOf>
	attribute: string
	value: string
}

/** The dataflows an IED publishes (through its control blocks) and subscribes to (through its elements). */
export type IedDataflows = {
	published: readonly Dataflow[]
	subscribed: readonly Dataflow[]
}

/** What subscribes to a control block: its registrations, the ExtRefs naming it, and their dataflows. */
export type ControlBlockSubscribers = {
	registrations: readonly Registration[]
	elements: readonly Scl.Ref<'ExtRef'>[]
	dataflows: readonly Dataflow[]
}

/**
 * How a signal (a SourceRef or a ControlRef) names what it is linked to: the logical node it takes
 * data from or controls, with the attributes of the data it names there, and the ExtRef / ExtCtrl
 * implementing it.
 */
export type SignalPairs = {
	specification: {
		uuid: string
		path: string
		doName: string | undefined
		daName: string | undefined
	}
	implementation: {
		uuid: string
		path: string
		resolution: ResolutionType
		targets: readonly Scl.ElementsOf[]
	}
	/** The other references of the signal (to a process resource), named by uuid only. */
	further: readonly { uuid: string; targets: readonly Scl.ElementsOf[] }[]
}
