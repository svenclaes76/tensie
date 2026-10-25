<script lang="ts">
	import '@fontsource/atkinson-hyperlegible/400.css';
	import '@fontsource/atkinson-hyperlegible/700.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(async () => {
		// The "Update beschikbaar" prompt (N1) hooks into onNeedRefresh once the UI exists.
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

{@render children()}
