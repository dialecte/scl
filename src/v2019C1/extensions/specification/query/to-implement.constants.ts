/** Why a real IED's to-do list is empty without being looked for. */
export const TO_IMPLEMENT_REASON = {
	/** The IED given is a specification IED: nothing on it is implemented. */
	notImplementedIed: 'not-implemented-ied',
	/** No LNode the IED implements carries a specification IED name: nothing says what it was specified as. */
	noSpecificationName: 'no-specification-name',
} as const
