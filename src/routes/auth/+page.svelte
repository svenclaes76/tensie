<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { startSync, sync, syncConfigured } from '#lib/sync/service.svelte.js';

	// The magic link lands here; supabase-js exchanges the code in the address for a session.
	const linkError =
		page.url.searchParams.get('error_description') ??
		new URLSearchParams(page.url.hash.slice(1)).get('error_description');

	let failed = $state(Boolean(linkError) || !syncConfigured);

	$effect(() => {
		if (sync.email) void goto('/settings', { replaceState: true });
	});

	onMount(() => {
		if (failed) return;
		void startSync();
		const timeout = setTimeout(() => {
			if (!sync.email) failed = true;
		}, 15_000);
		return () => clearTimeout(timeout);
	});
</script>

<svelte:head>
	<title>Aanmelden · Tensie</title>
</svelte:head>

<main>
	<h1>Aanmelden</h1>
	{#if failed}
		<p role="alert">
			Aanmelden met deze link lukte niet. De link is misschien verlopen of al gebruikt. Vraag in
			Instellingen een nieuwe inlogmail aan, of vul daar de code uit de mail in.
		</p>
		<p><a href="/settings">Naar Instellingen</a></p>
	{:else}
		<p role="status">Bezig met aanmelden…</p>
	{/if}
</main>

<style>
	main {
		max-width: 480px;
		margin: 0 auto;
		padding: 24px 16px;
	}

	h1 {
		margin: 0 0 12px;
		font-size: 22px;
	}

	p {
		margin: 0 0 8px;
	}
</style>
