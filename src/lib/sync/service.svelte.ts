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
			auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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

export type LoginError = 'unknown-email' | 'wrong-code' | 'failed';

/**
 * Sends the login email (P3): a magic link plus a 6-digit code. Only the existing owner account
 * can log in; the app never creates accounts.
 */
export async function sendLoginEmail(email: string): Promise<LoginError | null> {
	const supabase = await getClient();
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth` }
	});
	if (!error) return null;
	return /signup|not allowed|not found/i.test(error.message) ? 'unknown-email' : 'failed';
}

/** Logs in with the code from the email: needed in an installed iPhone app, where the link opens Safari. */
export async function verifyLoginCode(email: string, code: string): Promise<LoginError | null> {
	const supabase = await getClient();
	const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
	if (!error) return null;
	return /expired|invalid|token/i.test(error.message) ? 'wrong-code' : 'failed';
}

/** Logs out; the readings stay on this device. */
export async function signOut() {
	const supabase = await getClient();
	await supabase.auth.signOut();
}
