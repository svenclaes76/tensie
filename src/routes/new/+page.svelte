<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import CategoryBadge from '#lib/components/CategoryBadge.svelte';
	import { db } from '#lib/data/db.js';
	import { addReading } from '#lib/data/readings.js';
	import { deviceTimeZone, getSettings } from '#lib/data/settings.js';
	import { DEFAULT_DAY_PART_WINDOWS, getDayPart, parseTime, toLocal } from '#lib/domain/dayPart.js';
	import { DEFAULT_THRESHOLDS } from '#lib/domain/thresholds.js';
	import { fromLocal } from '#lib/domain/zonedTime.js';
	import {
		entryWarnings,
		liveCategory,
		MAX_DIGITS,
		parseMmHg,
		sanitizeDigits,
		type EntryWarning
	} from '#lib/entry.js';
	import { formatDayLabel, formatTime } from '#lib/format.js';
	import { DAY_PART_LABEL, MEDICAL_NOTE, VALUE_WARNING_TEXT } from '#lib/texts.js';

	const WARNING_TEXT: Record<EntryWarning, string> = {
		...VALUE_WARNING_TEXT,
		future: 'Tijdstip ligt in de toekomst'
	};

	// Where the reading is taken now, so a reading abroad keeps its own morning or evening slot.
	const timeZone = deviceTimeZone();

	let thresholds = $state.raw(DEFAULT_THRESHOLDS);
	let windows = $state.raw(DEFAULT_DAY_PART_WINDOWS);

	let systolicText = $state('');
	let diastolicText = $state('');
	let arm = $state<'left' | 'right' | null>(null);
	let note = $state('');

	// The time follows the clock until the user picks one (C1: defaults to now).
	let now = $state(new Date());
	let editingTime = $state(false);
	let dateInput = $state('');
	let timeInput = $state('');

	let error = $state<string | null>(null);
	let warnings = $state<EntryWarning[]>([]);
	let saving = $state(false);

	let systolicField = $state<HTMLInputElement>();
	let diastolicField = $state<HTMLInputElement>();
	let warningHeading = $state<HTMLHeadingElement>();

	const systolicCategory = $derived(liveCategory(systolicText, thresholds.systolic));
	const diastolicCategory = $derived(liveCategory(diastolicText, thresholds.diastolic));
	// The fixed doctor/112 line appears as soon as either value is severe.
	const showMedicalNote = $derived(
		systolicCategory === 'severe' || diastolicCategory === 'severe'
	);

	const today = $derived(toLocal(now.toISOString(), timeZone).date);
	/** Local date and minutes of the reading, or null while a picked time is incomplete. */
	const chosen = $derived.by(() => {
		if (!editingTime) {
			const local = toLocal(now.toISOString(), timeZone);
			return { date: local.date, minutes: local.minutes };
		}
		const minutes = parseTime(timeInput);
		return /^\d{4}-\d{2}-\d{2}$/.test(dateInput) && minutes !== null
			? { date: dateInput, minutes }
			: null;
	});
	const timeLabel = $derived.by(() => {
		if (!chosen) return 'Kies een datum en tijd';
		const measuredAt = fromLocal(chosen.date, chosen.minutes, timeZone);
		const part = getDayPart(measuredAt, timeZone, windows);
		return [
			formatDayLabel(chosen.date, today),
			formatTime(chosen.minutes),
			part === 'other' ? null : DAY_PART_LABEL[part]
		]
			.filter(Boolean)
			.join(' · ');
	});

	onMount(() => {
		systolicField?.focus();
		const timer = setInterval(() => (now = new Date()), 15_000);
		getSettings(db).then((settings) => {
			thresholds = settings.thresholds;
			windows = settings.dayPartWindows;
		});
		return () => clearInterval(timer);
	});

	function onSystolicInput(event: Event & { currentTarget: HTMLInputElement }) {
		const before = systolicText;
		systolicText = sanitizeDigits(event.currentTarget.value);
		event.currentTarget.value = systolicText;
		warnings = [];
		// Three digits typed: move on to the diastolic field, so entry needs no extra tap.
		if (systolicText.length === MAX_DIGITS && before.length < MAX_DIGITS) diastolicField?.focus();
	}

	function onDiastolicInput(event: Event & { currentTarget: HTMLInputElement }) {
		diastolicText = sanitizeDigits(event.currentTarget.value);
		event.currentTarget.value = diastolicText;
		warnings = [];
	}

	function editTime() {
		const local = toLocal(now.toISOString(), timeZone);
		dateInput = local.date;
		timeInput = formatTime(local.minutes);
		editingTime = true;
		warnings = [];
	}

	function useNow() {
		editingTime = false;
		warnings = [];
	}

	function toggleArm(side: 'left' | 'right') {
		arm = arm === side ? null : side;
	}

	function measuredAtNow(): string {
		const current = new Date();
		current.setSeconds(0, 0);
		return current.toISOString();
	}

	function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save(false);
	}

	/** Saves the reading; with `confirmed` false it first asks "Klopt dit?" when needed (C4). */
	async function save(confirmed: boolean) {
		error = null;
		const systolic = parseMmHg(systolicText);
		const diastolic = parseMmHg(diastolicText);
		if (systolic === null || diastolic === null) {
			error = 'Vul je bovendruk en onderdruk in.';
			(systolic === null ? systolicField : diastolicField)?.focus();
			return;
		}
		if (!chosen) {
			error = 'Kies een datum en tijd.';
			return;
		}
		const measuredAt = editingTime
			? fromLocal(chosen.date, chosen.minutes, timeZone)
			: measuredAtNow();

		if (!confirmed) {
			const found = entryWarnings({ systolic, diastolic }, measuredAt, new Date());
			if (found.length > 0) {
				warnings = found;
				await tick();
				warningHeading?.focus();
				return;
			}
		}

		saving = true;
		try {
			await addReading(db, {
				measuredAt,
				timeZone,
				systolic,
				diastolic,
				...(arm ? { arm } : {}),
				note
			});
			await goto('/list');
		} catch {
			error = 'Opslaan is mislukt. Probeer het opnieuw.';
		} finally {
			saving = false;
		}
	}

	function adjust() {
		warnings = [];
		systolicField?.focus();
	}
</script>

<svelte:head>
	<title>Nieuwe meting · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<a href="/" class="cancel">Annuleren</a>
		<h1>Nieuwe meting</h1>
	</header>

	<form onsubmit={onSubmit} novalidate>
		<div class="values">
			<div class="value">
				<label for="sys">Bovendruk</label>
				<input
					id="sys"
					bind:this={systolicField}
					value={systolicText}
					oninput={onSystolicInput}
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength={MAX_DIGITS}
					autocomplete="off"
					enterkeyhint="next"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							diastolicField?.focus();
						}
					}}
					aria-describedby="sys-cat"
					aria-invalid={error !== null && parseMmHg(systolicText) === null}
				/>
				<CategoryBadge id="sys-cat" category={systolicCategory} />
			</div>
			<div class="value">
				<label for="dia">Onderdruk</label>
				<input
					id="dia"
					bind:this={diastolicField}
					value={diastolicText}
					oninput={onDiastolicInput}
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength={MAX_DIGITS}
					autocomplete="off"
					enterkeyhint="done"
					aria-describedby="dia-cat"
					aria-invalid={error !== null && parseMmHg(diastolicText) === null}
				/>
				<CategoryBadge id="dia-cat" category={diastolicCategory} />
			</div>
		</div>
		<p class="unit">in mmHg</p>

		{#if showMedicalNote}
			<p class="medical">{MEDICAL_NOTE}</p>
		{/if}

		<div class="card time">
			{#if editingTime}
				<div class="time-fields">
					<div>
						<label for="date">Datum</label>
						<input id="date" type="date" bind:value={dateInput} max={today} />
					</div>
					<div>
						<label for="time">Tijd</label>
						<input id="time" type="time" step="60" bind:value={timeInput} />
					</div>
				</div>
				<div class="time-row">
					<span class="time-label">{timeLabel}</span>
					<button type="button" class="button-text" onclick={useNow}>Nu</button>
				</div>
			{:else}
				<div class="time-row">
					<div>
						<div class="time-caption">Tijdstip</div>
						<div class="time-label">{timeLabel}</div>
					</div>
					<button type="button" class="button-text" onclick={editTime}>
						Wijzig<span class="visually-hidden"> tijdstip</span>
					</button>
				</div>
			{/if}
		</div>

		<fieldset>
			<legend>Arm <span class="optional">(optioneel)</span></legend>
			<div class="arms">
				<button type="button" aria-pressed={arm === 'left'} onclick={() => toggleArm('left')}>
					Links
				</button>
				<button type="button" aria-pressed={arm === 'right'} onclick={() => toggleArm('right')}>
					Rechts
				</button>
			</div>
		</fieldset>

		<div class="note">
			<label for="note">Notitie <span class="optional">(optioneel)</span></label>
			<textarea id="note" rows="2" maxlength="500" placeholder="Bijv. start medicatie" bind:value={note}></textarea>
		</div>

		<div class="spacer"></div>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if warnings.length > 0}
			<section class="card warning" aria-labelledby="warning-title">
				<h2 id="warning-title" tabindex="-1" bind:this={warningHeading}>Klopt dit?</h2>
				<ul>
					{#each warnings as warning (warning)}
						<li>{WARNING_TEXT[warning]}</li>
					{/each}
				</ul>
				<button type="button" class="button-primary" disabled={saving} onclick={() => save(true)}>
					Toch opslaan
				</button>
				<button type="button" class="button-text" onclick={adjust}>Aanpassen</button>
			</section>
		{:else}
			<button type="submit" class="button-primary save" disabled={saving}>
				{saving ? 'Bezig met opslaan…' : 'Opslaan'}
			</button>
		{/if}
	</form>
</div>

<style>
	.screen {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 16px 12px 8px;
	}

	.cancel {
		justify-self: start;
		min-height: var(--tap);
		display: flex;
		align-items: center;
		padding: 0 8px;
		font-weight: 700;
		text-decoration: none;
	}

	h1 {
		margin: 0;
		font-size: 19px;
	}

	form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px 16px 20px;
	}

	.values {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.value {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	label,
	legend {
		font-size: 16px;
		font-weight: 700;
	}

	.optional {
		font-weight: 400;
		color: var(--muted);
	}

	.value input {
		width: 100%;
		height: 76px;
		border-radius: var(--radius);
		border: 2px solid var(--field-line);
		background: var(--card);
		font-size: 40px;
		font-weight: 700;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.value input:focus {
		outline: none;
		border: 3px solid var(--accent);
	}

	.value input[aria-invalid='true'] {
		border-color: var(--error-ink);
	}

	.unit {
		margin: -8px 0 0;
		font-size: 15px;
		color: var(--muted);
	}

	.medical {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--error-bg);
		color: var(--error-ink);
		font-size: 15px;
	}

	.time {
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.time-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.time-caption {
		font-size: 15px;
		color: var(--muted);
	}

	.time-label {
		font-size: 17px;
		font-weight: 700;
	}

	.time-fields {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 10px;
	}

	.time-fields input {
		display: block;
		width: 100%;
		height: var(--tap);
		margin-top: 4px;
		padding: 0 10px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 8px;
	}

	.arms {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.arms button {
		min-height: 48px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		font-size: 16px;
		cursor: pointer;
	}

	.arms button[aria-pressed='true'] {
		border: 2px solid var(--accent);
		background: #e3f1ee;
		font-weight: 700;
	}

	.note {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	textarea {
		width: 100%;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		padding: 10px 12px;
		font-size: 16px;
		resize: none;
	}

	.spacer {
		flex: 1;
	}

	.error {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--error-bg);
		color: var(--error-ink);
	}

	.warning {
		display: flex;
		flex-direction: column;
		gap: 10px;
		background: var(--warn-bg);
		border-color: #f0dfb4;
	}

	.warning h2 {
		margin: 0;
		font-size: 19px;
		color: var(--warn-ink);
	}

	.warning ul {
		margin: 0;
		padding-left: 20px;
		color: var(--warn-ink);
	}

	.warning .button-text {
		align-self: center;
	}

	.save {
		font-size: 19px;
	}
</style>
