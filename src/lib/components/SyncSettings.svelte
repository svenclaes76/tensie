<script lang="ts">
	import { deviceTimeZone } from '#lib/data/settings.js';
	import { toLocal } from '#lib/domain/dayPart.js';
	import { formatDateTime, formatTime } from '#lib/format.js';
	import {
		requestSync,
		sendLoginEmail,
		signOut,
		sync,
		syncConfigured,
		verifyLoginCode,
		type LoginError
	} from '#lib/sync/service.svelte.js';

	const LOGIN_ERROR: Record<LoginError, string> = {
		'unknown-email': 'Inloggen lukt alleen met het e-mailadres van je Tensie-account.',
		'wrong-code': 'Die code klopt niet of is verlopen. Vraag een nieuwe mail aan.',
		failed: 'Dat lukte niet. Controleer je internetverbinding en probeer het opnieuw.'
	};

	let email = $state('');
	let code = $state('');
	let step = $state<'email' | 'code'>('email');
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

	async function sendEmail(event: SubmitEvent) {
		event.preventDefault();
		const address = email.trim();
		if (!/^\S+@\S+\.\S+$/.test(address)) {
			error = 'Vul een geldig e-mailadres in.';
			return;
		}
		busy = true;
		error = null;
		const result = await sendLoginEmail(address);
		busy = false;
		if (result) error = LOGIN_ERROR[result];
		else {
			email = address;
			step = 'code';
		}
	}

	async function submitCode(event: SubmitEvent) {
		event.preventDefault();
		if (!/^\d{6,10}$/.test(code)) {
			error = 'Vul de code uit de mail in.';
			return;
		}
		busy = true;
		error = null;
		const result = await verifyLoginCode(email, code);
		busy = false;
		if (result) error = LOGIN_ERROR[result];
		else {
			code = '';
			step = 'email';
		}
	}

	function otherEmail() {
		step = 'email';
		code = '';
		error = null;
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
		{#if step === 'email'}
			<form onsubmit={sendEmail} novalidate>
				<label for="sync-email">E-mailadres</label>
				<input id="sync-email" type="email" autocomplete="email" inputmode="email" bind:value={email} />
				<button type="submit" class="button-primary" disabled={busy}>
					{busy ? 'Bezig…' : 'Stuur inlogmail'}
				</button>
			</form>
		{:else}
			<form onsubmit={submitCode} novalidate>
				<p>
					We stuurden een mail naar <strong>{email}</strong>. Tik op de link in de mail, of vul hier de
					code uit de mail in.
				</p>
				<label for="sync-code">Code</label>
				<input
					id="sync-code"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9]*"
					value={code}
					oninput={(e) => {
						code = e.currentTarget.value.replace(/\D/g, '').slice(0, 10);
						e.currentTarget.value = code;
					}}
				/>
				<button type="submit" class="button-primary" disabled={busy}>
					{busy ? 'Bezig…' : 'Aanmelden'}
				</button>
				<button type="button" class="button-text" onclick={otherEmail}>Ander e-mailadres</button>
			</form>
		{/if}
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
