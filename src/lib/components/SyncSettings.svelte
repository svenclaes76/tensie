<script lang="ts">
	import { deviceTimeZone } from '#lib/data/settings.js';
	import { toLocal } from '#lib/domain/dayPart.js';
	import { formatDateTime, formatTime } from '#lib/format.js';
	import {
		requestSync,
		signIn,
		signOut,
		sync,
		syncConfigured,
		type LoginError
	} from '#lib/sync/service.svelte.js';

	const LOGIN_ERROR: Record<LoginError, string> = {
		'wrong-credentials': 'E-mailadres of wachtwoord klopt niet.',
		'too-many-attempts': 'Te veel pogingen. Wacht even en probeer het dan opnieuw.',
		failed: 'Dat lukte niet. Controleer je internetverbinding en probeer het opnieuw.'
	};

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const timeZone = deviceTimeZone();

	const lastSynced = $derived.by(() => {
		if (!sync.lastSyncedAt) return null;
		const today = toLocal(new Date().toISOString(), timeZone).date;
		const local = toLocal(sync.lastSyncedAt, timeZone);
		return local.date === today
			? `vandaag om ${formatTime(local.minutes)}`
			: formatDateTime(sync.lastSyncedAt, timeZone);
	});

	const waiting = $derived(
		sync.pending === 1 ? '1 wijziging wacht.' : sync.pending > 1 ? `${sync.pending} wijzigingen wachten.` : ''
	);

	const statusText = $derived.by(() => {
		switch (sync.status) {
			case 'syncing':
				return 'Bezig met synchroniseren…';
			case 'offline':
				return `Offline: wijzigingen worden verzonden zodra je weer online bent. ${waiting}`.trim();
			case 'error':
				return `Synchroniseren lukte niet; Tensie probeert het zo opnieuw. ${waiting}`.trim();
			default:
				return lastSynced ? `Gesynchroniseerd ${lastSynced}.` : 'Nog niet gesynchroniseerd.';
		}
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const address = email.trim();
		if (!/^S+@S+.S+$/.test(address) || password === '') {
			error = 'Vul je e-mailadres en wachtwoord in.';
			return;
		}
		busy = true;
		error = null;
		const result = await signIn(address, password);
		busy = false;
		if (result) error = LOGIN_ERROR[result];
		else password = '';
	}
</script>

<section class="card" aria-labelledby="sync-title">
	<h2 id="sync-title">Synchronisatie</h2>

	{#if !syncConfigured}
		<p class="hint">Synchronisatie is niet ingesteld: je metingen staan alleen op dit toestel.</p>
	{:else if sync.status === 'signed-out'}
		<p class="hint">
			Meld je aan om je metingen veilig te bewaren en op je andere toestellen te zien. Tot dan staan ze
			alleen op dit toestel.
		</p>
		<form onsubmit={submit} novalidate>
			<label for="sync-email">E-mailadres</label>
			<input id="sync-email" type="email" autocomplete="username" inputmode="email" bind:value={email} />
			<label for="sync-password">Wachtwoord</label>
			<div class="password">
				<input
					id="sync-password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="current-password"
					bind:value={password}
				/>
				<button
					type="button"
					class="button-text"
					aria-pressed={showPassword}
					onclick={() => (showPassword = !showPassword)}
				>
					{showPassword ? 'Verberg' : 'Toon'}<span class="visually-hidden"> wachtwoord</span>
				</button>
			</div>
			<button type="submit" class="button-primary" disabled={busy}>
				{busy ? 'Bezig…' : 'Aanmelden'}
			</button>
		</form>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	{:else}
		<p>Aangemeld als <strong>{sync.email}</strong></p>
		<p class="status" role="status">{statusText}</p>
		<div class="actions">
			<button type="button" class="secondary" disabled={sync.status === 'syncing'} onclick={() => requestSync()}>
				Nu synchroniseren
			</button>
			<button type="button" class="button-text" onclick={() => void signOut()}>Afmelden</button>
		</div>
		<p class="hint">Afmelden laat je metingen op dit toestel staan.</p>
	{/if}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	p {
		margin: 0;
	}

	.hint {
		font-size: 15px;
		color: var(--muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	label {
		font-weight: 700;
	}

	input {
		width: 100%;
		height: 48px;
		padding: 0 12px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		font-size: 17px;
	}

	.password {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.password input {
		flex: 1;
	}

	.error {
		font-weight: 700;
		color: var(--error-ink);
	}

	.status {
		color: var(--accent);
		font-weight: 700;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.secondary {
		min-height: var(--tap);
		padding: 0 16px;
		border-radius: 12px;
		border: 2px solid var(--accent);
		background: var(--card);
		color: var(--accent);
		font-weight: 700;
		cursor: pointer;
	}
</style>
