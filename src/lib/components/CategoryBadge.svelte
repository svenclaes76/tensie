<script lang="ts">
	import type { Category } from '#lib/domain/types.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	let {
		category,
		id,
		prefix
	}: {
		/** Null shows a neutral "–" (no value yet). */
		category: Category | null;
		id?: string;
		/** Which value the badge is about: shown as "B ·", read as "Bovendruk:". */
		prefix?: { short: string; full: string };
	} = $props();
</script>

<span {id} class="badge {category ?? 'none'}"
	><!-- Whitespace next to {#if} is trimmed, hence the explicit {' '}. -->{#if prefix}<span
			aria-hidden="true">{prefix.short} ·{' '}</span
		><span class="visually-hidden">{prefix.full}:{' '}</span>{/if}{category
		? CATEGORY_LABEL[category]
		: '–'}</span
>

<style>
	.badge {
		align-self: flex-start;
		display: inline-block;
		font-size: 15px;
		font-weight: 700;
		padding: 4px 10px;
		border-radius: 999px;
	}

	.none {
		background: #eef0ee;
		color: var(--muted);
	}

	.normal {
		background: #e3f1ee;
		color: #1d5e53;
	}

	.mild {
		background: #fbefd2;
		color: #6b4700;
	}

	.moderate {
		background: #fbe1d3;
		color: #8a2e0b;
	}

	.severe {
		background: #9f1239;
		color: #ffffff;
	}
</style>
