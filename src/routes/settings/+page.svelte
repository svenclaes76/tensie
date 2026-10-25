<script lang="ts">
	import { onMount } from 'svelte';
	import { CATEGORY_MARK } from '#lib/colors.js';
	import { db } from '#lib/data/db.js';
	import { getSettings, saveSettings, type EffectiveSettings } from '#lib/data/settings.js';
	import { DEFAULT_DAY_PART_WINDOWS, validateDayPartWindows } from '#lib/domain/dayPart.js';
	import { DEFAULT_THRESHOLDS, validateThresholds } from '#lib/domain/thresholds.js';
	import type { CategoryLimits, DayPartWindows, Thresholds } from '#lib/domain/types.js';
	import { VALUE_RANGES } from '#lib/domain/validation.js';
	import { sanitizeDigits } from '#lib/entry.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	type Measure = keyof Thresholds;
	type Limit = keyof CategoryLimits;

	const LIMITS: Limit[] = ['mild', 'moderate', 'severe'];
	const MEASURES: { key: Measure; label: string }[] = [
		{ key: 'systolic', label: 'bovendruk' },
		{ key: 'diastolic', label: 'onderdruk' }
	];

	let loaded = $state(false);
	let text = $state<Record<Measure, Record<Limit, string>>>(toText(DEFAULT_THRESHOLDS));
	let windows = $state<DayPartWindows>(structuredClone(DEFAULT_DAY_PART_WINDOWS));
	let saved = $state.raw<EffectiveSettings | null>(null);
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	function toText(thresholds: Thresholds): Record<Measure, Record<Limit, string>> {
		const row = (limits: CategoryLimits) => ({
			mild: String(limits.mild),
			moderate: String(limits.moderate),
			severe: String(limits.severe)
		});
		return { systolic: row(thresholds.systolic), diastolic: row(thresholds.diastolic) };
	}

	/** Empty or partial input becomes NaN, which validation reports as not a whole number. */
	const draft = $derived.by((): Thresholds => {
		const row = (limits: Record<Limit, string>) => ({
			mild: limits.mild === '' ? Number.NaN : Number(limits.mild),
			moderate: limits.moderate === '' ? Number.NaN : Number(limits.moderate),
			severe: limits.severe === '' ? Number.NaN : Number(limits.severe)
		});
		return { systolic: row(text.systolic), diastolic: row(text.diastolic) };
	});
	const thresholdErrors = $derived(validateThresholds(draft));
	const badFields = $derived(
		new Set(
			thresholdErrors.flatMap((e) =>
				e.kind === 'not-rising'
					? [`${e.measure}.${e.lower}`, `${e.measure}.${e.upper}`]
					: [`${e.measure}.${e.limit}`]
			)
		)
	);
	const thresholdMessage = $derived(
		thresholdErrors.some((e) => e.kind === 'not-rising')
			? 'De grenzen moeten van boven naar onder telkens stijgen.'
			: thresholdErrors.length > 0
				? `Vul hele getallen in: bovendruk ${VALUE_RANGES.systolic.min}–${VALUE_RANGES.systolic.max}, onderdruk ${VALUE_RANGES.diastolic.min}–${VALUE_RANGES.diastolic.max}.`
				: null
	);

	const windowErrors = $derived(validateDayPartWindows(windows));
	const windowMessage = $derived(
		windowErrors.length === 0
			? null
			: windowErrors.some((e) => e.kind === 'invalid-time')
				? 'Vul een geldige tijd in.'
				: windowErrors.some((e) => e.kind === 'end-before-start')
					? 'Het einde moet na het begin liggen; een dagdeel kan niet over middernacht lopen.'
					: 'Ochtend en avond mogen elkaar niet overlappen.'
	);

	onMount(async () => {
		saved = await getSettings(db);
		text = toText(saved.thresholds);
		windows = structuredClone(saved.dayPartWindows);
		loaded = true;
	});

	function announce(message: string) {
		status = message;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (status = ''), 2500);
	}

	async function save(changes: Partial<EffectiveSettings>) {
		try {
			saved = await saveSettings(db, changes);
			announce('Opgeslagen');
		} catch {
			announce('Opslaan is mislukt. Probeer het opnieuw.');
		}
	}

	/** Saved when a field is left, and only when every limit is valid (T2). */
	function saveThresholds() {
		if (thresholdErrors.length > 0 || !saved) return;
		if (JSON.stringify(draft) === JSON.stringify(saved.thresholds)) return;
		void save({ thresholds: draft });
	}

	function saveWindows() {
		if (windowErrors.length > 0 || !saved) return;
		if (JSON.stringify(windows) === JSON.stringify(saved.dayPartWindows)) return;
		void save({ dayPartWindows: $state.snapshot(windows) });
	}

	function resetThresholds() {
		text = toText(DEFAULT_THRESHOLDS);
		saveThresholds();
	}
</script>

<svelte:head>
	<title>Instellingen · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<a href="/" class="back" aria-label="Terug">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
		</a>
		<h1>Instellingen</h1>
	</header>

	<main>
		<section class="card" aria-labelledby="thresholds-title">
			<div>
				<h2 id="thresholds-title">Drempelwaarden</h2>
				<p class="hint">
					Ondergrens per categorie in mmHg. Een waarde gelijk aan de grens valt in die categorie.
				</p>
			</div>

			<div class="grid">
				<span></span>
				<span class="col-head" aria-hidden="true">Boven</span>
				<span class="col-head" aria-hidden="true">Onder</span>

				<span class="row-name">
					<span class="swatch" style:background={CATEGORY_MARK.normal} aria-hidden="true"></span>
					{CATEGORY_LABEL.normal}
				</span>
				<span class="fixed">&lt; {text.systolic.mild || '…'}</span>
				<span class="fixed">&lt; {text.diastolic.mild || '…'}</span>

				{#each LIMITS as limit (limit)}
					<span class="row-name">
						<span class="swatch" style:background={CATEGORY_MARK[limit]} aria-hidden="true"></span>
						{CATEGORY_LABEL[limit]}
					</span>
					{#each MEASURES as measure (measure.key)}
						<input
							inputmode="numeric"
							pattern="[0-9]*"
							autocomplete="off"
							disabled={!loaded}
							aria-label="{CATEGORY_LABEL[limit]}, {measure.label} vanaf"
							aria-invalid={badFields.has(`${measure.key}.${limit}`)}
							aria-describedby={thresholdMessage ? 'threshold-error' : undefined}
							value={text[measure.key][limit]}
							oninput={(e) => {
								text[measure.key][limit] = sanitizeDigits(e.currentTarget.value);
								e.currentTarget.value = text[measure.key][limit];
							}}
							onchange={saveThresholds}
						/>
					{/each}
				{/each}
			</div>

			{#if thresholdMessage}
				<p id="threshold-error" class="error" role="alert">{thresholdMessage}</p>
			{/if}

			<button type="button" class="button-text reset" disabled={!loaded} onclick={resetThresholds}>
				Standaardwaarden herstellen
			</button>
		</section>

		<section class="card" aria-labelledby="dayparts-title">
			<h2 id="dayparts-title">Dagdelen</h2>
			{#each [{ key: 'morning', label: 'Ochtend' }, { key: 'evening', label: 'Avond' }] as const as part (part.key)}
				<fieldset>
					<legend>{part.label}</legend>
					<label>
						van
						<input type="time" step="60" aria-label="{part.label}, van" disabled={!loaded} bind:value={windows[part.key].start} onchange={saveWindows} aria-invalid={windowMessage !== null} />
					</label>
					<label>
						tot en met
						<input type="time" step="60" aria-label="{part.label}, tot en met" disabled={!loaded} bind:value={windows[part.key].end} onchange={saveWindows} aria-invalid={windowMessage !== null} />
					</label>
				</fieldset>
			{/each}
			{#if windowMessage}
				<p class="error" role="alert">{windowMessage}</p>
			{/if}
			<p class="hint">Metingen daarbuiten tellen als ‘andere’.</p>
		</section>

		<section class="card links">
			<a href="/import">Importeren uit Excel<span aria-hidden="true">›</span></a>
		</section>

		<p class="status" role="status">{status}</p>
	</main>
</div>

<style>
	.screen {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100vh;
		min-height: 100dvh;
	}

	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 16px 12px 8px;
	}

	.back {
		width: var(--tap);
		height: var(--tap);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	h1 {
		margin: 0;
		font-size: 22px;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 4px 16px 24px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.hint {
		margin: 4px 0 0;
		font-size: 15px;
		color: var(--muted);
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 84px 84px;
		gap: 8px 10px;
		align-items: center;
	}

	.col-head {
		font-size: 15px;
		font-weight: 700;
		text-align: center;
	}

	.row-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
	}

	.swatch {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 4px;
	}

	.fixed {
		text-align: center;
		color: var(--muted);
	}

	.grid input {
		width: 84px;
		height: 48px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		font-size: 18px;
		font-weight: 700;
		text-align: center;
	}

	.grid input[aria-invalid='true'] {
		border: 2px solid var(--error-ink);
	}

	.error {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: var(--error-ink);
	}

	.reset {
		align-self: flex-start;
		padding: 0 4px;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px;
		align-items: end;
	}

	legend {
		float: left;
		padding-bottom: 14px;
	}

	fieldset label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		color: var(--muted);
	}

	fieldset input {
		width: 100%;
		height: 48px;
		padding: 0 8px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		color: var(--ink);
		font-size: 16px;
	}

	fieldset input[aria-invalid='true'] {
		border: 2px solid var(--error-ink);
	}

	.links {
		padding: 0;
		gap: 0;
		overflow: hidden;
	}

	.links a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 56px;
		padding: 0 16px;
		font-weight: 700;
		text-decoration: none;
		color: var(--ink);
	}

	.links a span {
		color: var(--muted);
	}

	.status {
		min-height: 24px;
		margin: 0;
		text-align: center;
		color: var(--accent);
		font-weight: 700;
	}
</style>
