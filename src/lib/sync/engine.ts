import { fromSync, SYNCED_TABLES, type SyncedTable, type TensieDb } from '../data/db';
import { fromRemote, toRemote, type RemoteRow } from './mapping';

/** The server, as the engine sees it. `supabaseRemote.ts` implements it; tests use a fake. */
export interface Remote {
	/** Upserts rows; the server keeps whichever has the newest updated_at (last change wins). */
	push(table: SyncedTable, rows: RemoteRow[]): Promise<void>;
	/** Rows with synced_at after `since` (all when null), oldest synced_at first, at most `limit`. */
	pull(table: SyncedTable, since: string | null, limit: number): Promise<RemoteRow[]>;
}

export const PAGE_SIZE = 500;
/**
 * Pulls start a little before the cursor: a change committed by a slow transaction can carry a
 * synced_at just before one already pulled. Pulling it twice is harmless (equal = no change).
 */
export const PULL_OVERLAP_MS = 5 * 60_000;

export interface SyncResult {
	pushed: number;
	pulled: number;
}

async function pushTable(db: TensieDb, remote: Remote, table: SyncedTable): Promise<number> {
	let pushed = 0;
	for (;;) {
		const pending = await db[table].where('syncPending').equals(1).limit(PAGE_SIZE).toArray();
		if (pending.length === 0) return pushed;
		await remote.push(
			table,
			pending.map((row) => toRemote(table, row))
		);
		// Clear the mark only where nothing changed during the push: a newer edit stays pending.
		const sent = new Map(pending.map((row) => [row.id, row.updatedAt]));
		await fromSync(db, [table], () =>
			db
				.table(table)
				.where('id')
				.anyOf([...sent.keys()])
				.modify((row: { id: string; updatedAt: string; syncPending?: 0 | 1 }) => {
					if (row.updatedAt === sent.get(row.id)) row.syncPending = 0;
				})
		);
		pushed += pending.length;
		// Rows edited during the push are still pending; stop rather than loop on them now.
		if (pending.length < PAGE_SIZE) return pushed;
	}
}

async function pullTable(db: TensieDb, remote: Remote, table: SyncedTable): Promise<number> {
	const state = await db.syncState.get(table);
	let cursor = state?.cursor ?? null;
	let since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
	let pulled = 0;
	for (;;) {
		const rows = await remote.pull(table, since, PAGE_SIZE);
		if (rows.length === 0) break;
		await fromSync(db, [table], async () => {
			for (const remoteRow of rows) {
				const incoming = fromRemote(table, remoteRow);
				const local = await db[table].get(incoming.id);
				// Last change wins; an equal one is the same change coming back.
				if (!local || incoming.updatedAt > local.updatedAt) {
					await db[table].put({ ...incoming, syncPending: 0 } as never);
				} else if (incoming.updatedAt < local.updatedAt && local.syncPending !== 1) {
					// The server has an older version than this device: send ours again.
					await db[table].update(incoming.id, { syncPending: 1 } as never);
				}
				const syncedAt = remoteRow.synced_at ?? null;
				if (syncedAt && (!cursor || Date.parse(syncedAt) > Date.parse(cursor))) cursor = syncedAt;
			}
			await db.syncState.put({ table, cursor });
		});
		pulled += rows.length;
		if (rows.length < PAGE_SIZE) break;
		since = rows[rows.length - 1].synced_at ?? since;
	}
	return pulled;
}

/**
 * One sync round (N2): push every pending local change, then pull every server change since the
 * last round. A failure leaves pending rows pending, so nothing is lost; the next round retries.
 */
export async function syncOnce(db: TensieDb, remote: Remote): Promise<SyncResult> {
	let pushed = 0;
	let pulled = 0;
	for (const table of SYNCED_TABLES) pushed += await pushTable(db, remote, table);
	for (const table of SYNCED_TABLES) pulled += await pullTable(db, remote, table);
	return { pushed, pulled };
}

/** Number of local changes not yet confirmed by the server. */
export async function pendingCount(db: TensieDb): Promise<number> {
	const counts = await Promise.all(
		SYNCED_TABLES.map((table) => db[table].where('syncPending').equals(1).count())
	);
	return counts.reduce((a, b) => a + b, 0);
}
