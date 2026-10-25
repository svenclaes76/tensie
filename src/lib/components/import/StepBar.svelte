<script lang="ts">
	/** 1–3 is the current step; 4 means all steps are done. */
	let { current }: { current: 1 | 2 | 3 | 4 } = $props();

	const steps = ['Bestand', 'Kolommen', 'Bevestigen'];
</script>

<ol aria-label="Stappen">
	{#each steps as label, i (label)}
		{@const step = i + 1}
		<li
			class:done={step < current}
			class:current={step === current}
			aria-current={step === current ? 'step' : undefined}
		>
			{step} · {label}
		</li>
	{/each}
</ol>

<style>
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
	}

	li {
		font-size: 14px;
		color: var(--muted);
		border-top: 4px solid var(--step-off);
		padding-top: 6px;
	}

	.done {
		font-weight: 700;
		border-top-color: var(--accent);
	}

	.current {
		font-weight: 700;
		color: var(--ink);
		border-top-color: var(--accent);
	}
</style>
