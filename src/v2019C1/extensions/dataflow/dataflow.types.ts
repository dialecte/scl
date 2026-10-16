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
