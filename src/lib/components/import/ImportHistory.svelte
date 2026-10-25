<script lang="ts">
	import type { ImportRecord } from '#lib/data/db.js';
	import { countReadings, formatDateTime } from '#lib/format.js';
	import UndoImport from './UndoImport.svelte';

	let {
		imports,
		timeZone,
		onundo
	}: {
		imports: ImportRecord[];
		timeZone: string;
		onundo: (importId: string) => Promise<void>;
	} = $props();
</script>

<section aria-labelledby="history-title">
	<h2 id="history-title">Eerdere imports</h2>
	<ul>
		{#each imports as record (record.id)}
			<li class="card">
				<div class="name">{record.fileName}</div>
				<div class="meta">
					{formatDateTime(record.importedAt, timeZone)} · {countReadings(record.readingCount)}
				</div>
				{#if record.undoneAt}
					<div class="meta">Ongedaan gemaakt op {formatDateTime(record.undoneAt, timeZone)}</div>
				{:else}
					<UndoImport count={record.readingCount} onconfirm={() => onundo(record.id)} />
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	h2 {
		margin: 0 0 8px;
		font-size: 17px;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.meta {
		font-size: 15px;
		color: var(--muted);
	}
</style>
