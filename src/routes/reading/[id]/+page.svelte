<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import ReadingForm from '#lib/components/ReadingForm.svelte';
	import { db, type Reading } from '#lib/data/db.js';
	import { deleteReading, getReading, updateReading, type NewReading } from '#lib/data/readings.js';
	import { offerUndo } from '#lib/undo.svelte.js';

	const id = page.params.id ?? '';

	/** undefined while loading, null when there is no such (live) reading. */
	let reading = $state.raw<Reading | null | undefined>(undefined);

	onMount(async () => {
		reading = (await getReading(db, id)) ?? null;
	});

	async function save(values: NewReading) {
		await updateReading(db, id, values);
		await goto('/list');
	}

	async function remove() {
		await deleteReading(db, id);
		offerUndo(id);
		await goto('/list');
	}
</script>

<svelte:head>
	<title>Meting bewerken · Tensie</title>
</svelte:head>

{#if reading}
	<ReadingForm
		title="Meting bewerken"
		cancelHref="/list"
		initial={{
			measuredAt: reading.measuredAt,
			timeZone: reading.timeZone,
			systolic: reading.systolic,
			diastolic: reading.diastolic,
			arm: reading.arm,
			note: reading.note
		}}
		onsave={save}
		ondelete={remove}
	/>
{:else if reading === null}
	<main class="missing">
		<h1>Meting niet gevonden</h1>
		<p>Deze meting bestaat niet (meer).</p>
		<p><a href="/list">Naar de lijst</a></p>
	</main>
{/if}

<style>
	.missing {
		max-width: 480px;
		margin: 0 auto;
		padding: 24px 16px;
	}

	.missing h1 {
		margin: 0 0 8px;
		font-size: 22px;
	}

	.missing p {
		margin: 0 0 8px;
	}
</style>
