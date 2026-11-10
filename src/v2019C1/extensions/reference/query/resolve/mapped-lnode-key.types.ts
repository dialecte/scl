/** How an LNode names the logical node implementing it. */
export type MappedLNodeKey = { kind: 'uuid'; uuid: string } | { kind: 'path'; path: string }
