/// <reference types="vite-plugin-pwa/client" />

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Supabase project (docs/supabase-setup.md); only the public key, never a secret one.
	interface ImportMetaEnv {
		readonly VITE_SUPABASE_URL?: string;
		readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
