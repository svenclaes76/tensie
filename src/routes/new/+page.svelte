<script lang="ts">
	import { goto } from '$app/navigation';
	import ReadingForm from '#lib/components/ReadingForm.svelte';
	import { db } from '#lib/data/db.js';
	import { addReading, type NewReading } from '#lib/data/readings.js';

	async function save(reading: NewReading) {
		await addReading(db, reading);
		await goto('/list');
	}
</script>

<svelte:head>
	<title>Nieuwe meting · Tensie</title>
</svelte:head>

<ReadingForm title="Nieuwe meting" cancelHref="/" onsave={save} />
