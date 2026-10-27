/**
 * The lineage values of the project a reference may be paired by name on: those `checkTemplateUuids` flags as
 * placeholders, when the consumer asked for it (`Resolution.referencesByName: 'placeholders'`). Empty: a reference
 * pairs by the uuids it names only.
 */
export type PlaceholderLineages = ReadonlySet<string>
