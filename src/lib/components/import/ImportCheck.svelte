<script lang="ts">
	import type { SvelteSet } from 'svelte/reactivity';
	import type { ImportPreview } from '#lib/domain/import/parse.js';
	import { formatDateTime } from '#lib/format.js';
	import { FLAG_TEXT, REASON_TEXT } from '#lib/import/texts.js';

	let { preview, confirmed }: { preview: ImportPreview; confirmed: SvelteSet<number> } = $props();

	const flagged = $derived(
		preview.rows.flatMap((row) => (row.status === 'needs-confirmation' ? [row] : []))
	);
	const rejected = $derived(
		preview.rows.flatMap((row) => (row.status === 'rejected' ? [row] : []))
	);

	function toggle(rowNumber: number, checked: boolean) {
		if (checked) confirmed.add(rowNumber);
		else confirmed.delete(rowNumber);
	}
</script>

<section class="card" aria-labelledby="check-title">
	<h2 id="check-title">Controle</h2>

	<div class="line"><span>Klaar om te importeren</span><strong>{preview.counts.ready}</strong></div>

	{#if flagged.length > 0}
		<div class="line warn"><span>Te controleren</span><strong>{flagged.length}</strong></div>
		<p class="hint">Vink aan wat toch geïmporteerd mag worden. De rest wordt overgeslagen.</p>
		<ul class="flagged">
			{#each flagged as row (row.rowNumber)}
				<li>
					<label>
						<input
							type="checkbox"
							checked={confirmed.has(row.rowNumber)}
							onchange={(e) => toggle(row.rowNumber, e.currentTarget.checked)}
						/>
						<span>
							<strong>Rij {row.rowNumber} · {formatDateTime(row.reading.measuredAt, row.reading.timeZone)}</strong>
							· <span class="values">{row.reading.systolic} / {row.reading.diastolic}</span>
							<span class="reason">{row.flags.map((flag) => FLAG_TEXT[flag]).join(' · ')}</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>
	{/if}

	{#if preview.counts.duplicate > 0}
		<div class="line muted">
			<span>Al aanwezig, overgeslagen</span><strong>{preview.counts.duplicate}</strong>
		</div>
	{/if}

	{#if rejected.length > 0}
		<details>
			<summary>
				<span>Niet leesbaar, overgeslagen</span><strong>{rejected.length}</strong>
			</summary>
			<ul class="rejected">
				{#each rejected as row (row.rowNumber)}
					<li>Rij {row.rowNumber} · {REASON_TEXT[row.reason]}</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.line,
	summary {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	.warn {
		color: var(--warn-ink);
	}

	.muted {
		color: var(--muted);
	}

	.hint {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.flagged {
		padding: 4px 8px;
		border-radius: 10px;
		background: var(--warn-bg);
	}

	.flagged label {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		min-height: var(--tap);
		padding: 8px 4px;
		font-size: 15px;
		cursor: pointer;
	}

	.flagged input {
		flex: none;
		width: 24px;
		height: 24px;
		margin: 0;
		accent-color: var(--accent);
	}

	.values {
		white-space: nowrap;
	}

	.reason {
		display: block;
		color: var(--warn-ink);
	}

	details {
		color: var(--muted);
	}

	summary {
		min-height: var(--tap);
		align-items: center;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary span {
		text-decoration: underline;
	}

	.rejected {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--ground);
		color: var(--ink);
		font-size: 15px;
	}
</style>
