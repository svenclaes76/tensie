import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './engine';
import type { RemoteRow } from './mapping';

/**
 * The engine's server, through Supabase's REST API with the signed-in user's session. Row-level
 * security limits every request to the owner's rows; the database decides last change wins.
 */
export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
	return {
		async push(table, rows) {
			const { error } = await client
				.from(table)
				.upsert(
					rows.map((row) => ({ ...row, user_id: userId })),
					{ onConflict: 'user_id,id' }
				);
			if (error) throw new Error(`Push ${table}: ${error.message}`);
		},

		async pull(table, since, limit) {
			let query = client.from(table).select('*').order('synced_at', { ascending: true }).limit(limit);
			if (since) query = query.gt('synced_at', since);
			const { data, error } = await query;
			if (error) throw new Error(`Pull ${table}: ${error.message}`);
			return (data ?? []).map((row) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { user_id, ...rest } = row as Record<string, unknown>;
				return rest as RemoteRow;
			});
		}
	};
}
