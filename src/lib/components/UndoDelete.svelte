<script lang="ts">
	import { db } from '#lib/data/db.js';
	import { restoreReading } from '#lib/data/readings.js';
	import { clearUndo, undo } from '#lib/undo.svelte.js';

	let busy = $state(false);
	let restored = $state(false);
	let secondsLeft = $state(0);

	// Counts down the offer and closes it when time is up.
	$effect(() => {
		const pending = undo.pending;
		if (!pending) return;
		restored = false;
		const tick = () => {
			secondsLeft = Math.max(0, Math.ceil((pending.until - Date.now()) / 1000));
			if (secondsLeft === 0) clearUndo();
		};
		tick();
		const timer = setInterval(tick, 250);
		return () => clearInterval(timer);
	});

	async function undoDelete() {
		const pending = undo.pending;
		if (!pending) return;
		busy = true;
		try {
			await restoreReading(db, pending.readingId);
			restored = true;
			clearUndo();
			setTimeout(() => (restored = false), 3000);
		} finally {
			busy = false;
		}
	}
</script>

<div class="slot" role="status">
	{#if undo.pending}
		<div class="bar">
			<span>Meting verwijderd</span>
			<button type="button" disabled={busy} onclick={undoDelete}>
				Ongedaan maken <span class="seconds">({secondsLeft})</span>
			</button>
		</div>
	{:else if restored}
		<div class="bar"><span>Meting teruggezet</span></div>
	{/if}
</div>

<style>
	.slot {
		padding: 0 12px;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
		padding: 6px 6px 6px 16px;
		border-radius: 14px;
		background: var(--ink);
		color: #ffffff;
	}

	button {
		flex: none;
		white-space: nowrap;
		min-height: var(--tap);
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: #9fe3d6;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.seconds {
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
</style>
