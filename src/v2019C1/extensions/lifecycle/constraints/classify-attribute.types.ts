/** How the UI may treat an attribute of an element during a lifecycle transaction. */
export type AttributeEditability =
	/** Identity/lineage — never user-editable (uuid, lnClass, and other scoped-key fields). */
	| 'identity'
	/** A reference (path/uuid pair) — system-owned, remapped automatically. */
	| 'reference'
	/** The mutable label (`name`) — editable; changing it triggers a managed ref-path rebuild. */
	| 'rename'
	/** Freely editable — no reference/identity side effect (desc, value, …). */
	| 'free'

/** An attribute the UI may edit, with its edit mode (from {@link AttributeEditability}). */
export type EditableAttribute = {
	attr: string
	mode: 'rename' | 'free'
	/**
	 * Set at report time when placing this element would collide on this field and the
	 * engine auto-resolved it. `suggestedValue` is the collision-free value the engine
	 * proposes (the user may keep or override it).
	 */
	conflict?: boolean
	suggestedValue?: string
}
