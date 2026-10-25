<script lang="ts">
	import type { Category } from '#lib/domain/types.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	/** Null shows a neutral "–" (no value yet). */
	let { category, id }: { category: Category | null; id?: string } = $props();
</script>

<span {id} class="badge {category ?? 'none'}">{category ? CATEGORY_LABEL[category] : '–'}</span>

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
