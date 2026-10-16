import type { Scl } from '@/v2019C1/config'
import type { ResolutionType } from '@/v2019C1/extensions/reference'

/**
 * The shape an `ExtRef` (an input of a logical node) is written in, when it is one of the four
 * documented ones:
 * - `later-binding`: it carries the internal address it will land on and the expected data object,
 *   nothing of a signal, a service or a control block;
 * - `expected`: it names the signal, and neither an internal address nor a control block;
 * - `subscribed`: it names the signal, the service and the control block publishing it (a service
 *   published without a control block needs none), and lands nowhere yet;
 * - `bound`: the same, with the internal address it lands on in the receiving device.
 *
 * A signal is named once its logical node is named, by its uuid or by its IED, logical device and
 * logical node class (a uuid naming the element stands for its names), and its data object is given.
 * An ExtRef written in none of these shapes has no state: nothing written, an internal address
 * without the expected data object, a signal named in part, a control block named without a signal,
 * an internal address beside a signal without its service or without the control block its service
 * needs. Attributes a shape does not use (the expected data object of a signal named) are not read. A service published without a control block (polling) needs none; the others need the
 * control block named, by its uuid or by its name.
 */
export type ExtRefState = 'later-binding' | 'expected' | 'subscribed' | 'bound'

/**
 * The shape an `ExtCtrl` (an output of a logical node) is written in, when it is one of the two its
 * purposes document:
 * - `later-binding`: it carries the internal address it starts from, nothing of a signal (the
 *   expected data object is optional);
 * - `bound`: it names the signal it controls and the internal address it starts from.
 *
 * An ExtCtrl written in neither has no state: a signal without an internal address, a signal named in
 * part, nothing written.
 */
export type ExtCtrlState = 'later-binding' | 'bound'

/**
 * The attributes through which an `ExtRef` / `ExtCtrl` names its signal: the logical node is named
 * once `uuid` is set or all of `names` are; the signal once `data` is set as well. `written` lists
 * every attribute of the signal, named or not: a later-binding element has none of them.
 */
export type SignalAttributes = {
	uuid: string
	names: readonly string[]
	data: string
	written: readonly string[]
}

/**
 * The later-binding shape of an `ExtRef` / `ExtCtrl`: the attributes it carries (`required`: the
 * internal address, and for an `ExtRef` the expected data object) and the ones it must not (`forbidden`, those of a
 * signal and, for an `ExtRef`, of a service and a control block). An attribute that is neither is
 * not read.
 */
export type LaterBindingAttributes = {
	required: readonly string[]
	forbidden: readonly string[]
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
		 * signal gives none, or gives it by a path the data model cannot split; `dataPath` is that path's
		 * data qualifier as written, set whenever the data comes from the path; `undefined` while no
		 * logical node is named, or it names nothing.
		 */
		other:
			| { lnode: Scl.Ref<'LNode'>; doName?: string; daName?: string; dataPath?: string }
			| undefined
		/**
		 * Where the two logical nodes are implemented: both in one IED (`same-ied`), in two
		 * (`inter-ied`), or one of them is not mapped to a logical node (`unallocated`). Never read
		 * from the service.
		 */
		allocation: 'same-ied' | 'inter-ied' | 'unallocated'
		/**
		 * The IED each of the two logical nodes is mapped into: the holder's, and the other's (`undefined`
		 * while the signal names no other logical node). `undefined` for one that is not mapped to a
		 * logical node of the document. What `allocation` is read from.
		 */
		mappedIeds: { holder: Scl.Ref<'IED'> | undefined; other: Scl.Ref<'IED'> | undefined }
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
		/**
		 * The shape the element is written in; `undefined` without an element, or when it is written
		 * in none of the documented shapes.
		 */
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

/**
 * An ExtRef naming a control block that no signal of the specification links to. It is implemented
 * by definition (`state` is always `implemented`); `binding` is the shape the ExtRef is written in,
 * absent when it is written in none of the documented ones (a partial signal).
 */
export type ImplementationOnlyDataflow = {
	kind: 'implementation-only'
	element: Scl.Ref<'ExtRef'>
	implementation: Omit<SpecifiedDataflow['implementation'], 'binding'> & {
		state: 'implemented'
		binding?: ExtRefState
	}
}

/**
 * The subscriber's own entry on a control block (an `IEDName`, or a `ClientLN` of a report), and
 * how precisely it names the subscriber: its access point (the least precise: it always names its
 * IED and an access point), its logical device, or its logical node. It names the subscriber by
 * the uuids it carries, else by its names. Its `apRef` names an access point of the IED the
 * registration names; it is a matching key only for a client logical node held directly by an access
 * point, and an `apUuid` matches any access point of that IED.
 */
export type Registration = {
	element: Scl.Ref<'IEDName' | 'ClientLN'>
	names: 'ap' | 'ld' | 'ln'
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
