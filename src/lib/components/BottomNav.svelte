<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{
			href: '/',
			label: 'Home',
			icon: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"></path>'
		},
		{
			href: '/list',
			label: 'Lijst',
			icon: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"></path>'
		},
		{
			href: '/chart',
			label: 'Grafiek',
			icon: '<path d="M3 3v18h18"></path><path d="m6 15 4-4 3 3 6-7"></path>'
		},
		{
			href: '/monthly',
			label: 'Maand',
			icon: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>'
		}
	];
</script>

<nav aria-label="Hoofdmenu" style:grid-template-columns="repeat({tabs.length}, minmax(0, 1fr))">
	{#each tabs as tab (tab.href)}
		{@const current = page.url.pathname === tab.href}
		<a href={tab.href} aria-current={current ? 'page' : undefined} class:current>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				{@html tab.icon}
			</svg>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	nav {
		display: grid;
		border-top: 1px solid var(--line);
		background: var(--card);
		padding: 6px 8px calc(10px + env(safe-area-inset-bottom));
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		min-height: 52px;
		font-size: 14px;
		text-decoration: none;
		color: var(--muted);
	}

	.current {
		font-weight: 700;
		color: var(--accent);
	}
</style>
