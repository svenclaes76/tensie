<script lang="ts">
	import { tick } from 'svelte';
	import { countReadings } from '#lib/format.js';

	let { count, onconfirm }: { count: number; onconfirm: () => Promise<void> } = $props();

	let confirming = $state(false);
	let busy = $state(false);
	let confirmButton = $state<HTMLButtonElement>();

	async function ask() {
		confirming = true;
		await tick();
		confirmButton?.focus();
	}

	async function confirm() {
		busy = true;
		try {
			await onconfirm();
		} finally {
			busy = false;
			confirming = false;
		}
	}
</script>

{#if confirming}
	<div class="confirm" role="group" aria-label="Import ongedaan maken">
		<p>{countReadings(count)} uit deze import verwijderen?</p>
		<div class="actions">
			<button type="button" class="danger" bind:this={confirmButton} disabled={busy} onclick={confirm}>
				Ja, verwijderen
			</button>
			<button type="button" class="button-text" disabled={busy} onclick={() => (confirming = false)}>
				Annuleren
			</button>
		</div>
	</div>
{:else}
	<button type="button" class="button-text undo" onclick={ask}>Ongedaan maken</button>
{/if}

<style>
	.undo {
		align-self: flex-start;
		padding: 0;
	}

	.confirm {
		align-self: stretch;
	}

	.confirm p {
		margin: 0 0 6px;
		font-weight: 700;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.danger {
		min-height: var(--tap);
		padding: 0 16px;
		border: 0;
		border-radius: 12px;
		background: var(--error-ink);
		color: #ffffff;
		font-weight: 700;
		cursor: pointer;
	}
</style>
