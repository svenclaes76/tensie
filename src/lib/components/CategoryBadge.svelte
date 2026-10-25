<script lang="ts">
	import type { Category } from '#lib/domain/types.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	/** Null shows a neutral "–" (no value yet). */
	let { category, id }: { category: Category | null; id?: string } = $props();

	const tone = $derived(category ? category.split(' ')[0] : 'none');
</script>

<span {id} class="badge {tone}">{category ? CATEGORY_LABEL[category] : '–'}</span>

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

	.normaal {
		background: #e3f1ee;
		color: #1d5e53;
	}

	.licht {
		background: #fbefd2;
		color: #6b4700;
	}

	.gemiddeld {
		background: #fbe1d3;
		color: #8a2e0b;
	}

	.ernstig {
		background: #9f1239;
		color: #ffffff;
	}
</style>
