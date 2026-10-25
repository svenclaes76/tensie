import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { pendingCount, syncOnce } from './engine';
import { supabaseRemote } from './supabaseRemote';

// Only the public (publishable/anon) key may ever be here; see docs/supabase-setup.md.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Without a project configured, the app simply keeps everything on the device. */
export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

export const sync = $state({
	status: (syncConfigured ? 'signed-out' : 'off') as SyncStatus,
	email: null as string | null,
	/** ISO instant of the last successful round. */
	lastSyncedAt: null as string | null,
	/** Local changes not yet confirmed by the server. */
	pending: 0
});

const AFTER_CHANGE_MS = 2_000;
const RETRY_MS = 60_000;
const EVERY_MS = 5 * 60_000;

let client: SupabaseClient | null = null;
let userId: string | null = null;
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let runAgain = false;

async function getClient(): Promise<SupabaseClient> {
	if (!client) {
		// Loaded only when sync is configured, so the app shell stays small.
		const { createClient } = await import('@supabase/supabase-js');
		client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
			// Password login only: no redirects back into the app to look for.
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
		});
	}
	return client;
}

function useSession(session: Session | null) {
	userId = session?.user.id ?? null;
	sync.email = session?.user.email ?? null;
	if (!userId) {
		sync.status = 'signed-out';
		return;
	}
	if (sync.status === 'signed-out' || sync.status === 'off') sync.status = 'idle';
	requestSync();
}

/** Starts background sync (once): on start, back online, back in view, after changes, every 5 minutes. */
export async function startSync() {
	if (!syncConfigured || started) return;
	started = true;
	const supabase = await getClient();
	supabase.auth.onAuthStateChange((_event, session) => useSession(session));
	useSession((await supabase.auth.getSession()).data.session);

	window.addEventListener('online', () => requestSync());
	window.addEventListener('offline', () => {
		if (userId) sync.status = 'offline';
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') requestSync();
	});
	setInterval(() => requestSync(), EVERY_MS);
	liveQuery(() => pendingCount(db)).subscribe((count) => {
		sync.pending = count;
		if (count > 0) requestSync(AFTER_CHANGE_MS);
	});
}

/** Schedules a sync round; entry is never blocked by it (local-first). */
export function requestSync(delayMs = 0) {
	if (!userId) return;
	clearTimeout(timer);
	timer = setTimeout(() => void runSync(), delayMs);
}

async function runSync() {
	if (!userId || !client) return;
	if (running) {
		runAgain = true;
		return;
	}
	if (!navigator.onLine) {
		sync.status = 'offline';
		return;
	}
	running = true;
	sync.status = 'syncing';
	try {
		await syncOnce(db, supabaseRemote(client, userId));
		sync.status = 'idle';
		sync.lastSyncedAt = new Date().toISOString();
	} catch {
		sync.status = navigator.onLine ? 'error' : 'offline';
		requestSync(RETRY_MS);
	} finally {
		running = false;
		if (runAgain) {
			runAgain = false;
			requestSync();
		}
	}
}

export type LoginError = 'wrong-credentials' | 'too-many-attempts' | 'failed';

/**
 * Logs in with email and password (P3). Works in an installed iPhone app, unlike an emailed link,
 * which opens Safari. Only the owner account exists; the app never creates accounts.
 */
export async function signIn(email: string, password: string): Promise<LoginError | null> {
	const supabase = await getClient();
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	if (!error) return null;
	const code = (error as { code?: string; status?: number }).code;
	const status = (error as { status?: number }).status;
	if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message))
		return 'wrong-credentials';
	if (status === 429 || /rate limit|too many/i.test(error.message)) return 'too-many-attempts';
	return 'failed';
}

/** Logs out; the readings stay on this device. */
export async function signOut() {
	const supabase = await getClient();
	await supabase.auth.signOut();
}
