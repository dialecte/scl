import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'

/** Whether the element extracted stays an instance of the template it was made from. */
export type TemplateLink = 'keep' | 'break'

/** What an extract writes besides the content: which file, and the element's link to its template. */
export type ExtractOptions = {
	/**
	 * The file written: a new template (`'new'`, default: a uuid of its own, version `0`, revision `1`), or a new
	 * revision of the template the element came from (`'revision'`: not available yet, refused with
	 * `OPTION_NOT_AVAILABLE`).
	 */
	as?: FileStart
	/**
	 * The element extracted (the function, the application, the level) loses its template link (`'break'`, default:
	 * its `templateUuid`, `originUuid` and its own file reference go), or keeps it (`'keep'`). What it holds keeps its
	 * lineage either way.
	 */
	templateLink?: TemplateLink
}

/**
 * What an extract left out and says so: `sections-not-carried` — the `IED` and `Communication` sections of the source,
 * which an SSD does not carry yet, with their count.
 */
export type ExtractWarning = {
	code: 'sections-not-carried'
	counts: { IED: number; Communication: number }
}
