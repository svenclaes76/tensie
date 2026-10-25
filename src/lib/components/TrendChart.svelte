<script lang="ts">
	import type { ChartData } from '#lib/chart.js';
	import type { Category } from '#lib/domain/types.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	let { data, label }: { data: ChartData; label: string } = $props();

	// Dot colours by category, checked with the dataviz palette validator: CVD and
	// normal-vision separation pass; amber is below 3:1 on white, which the category bands,
	// the tooltip and the table view make up for.
	const DOT: Record<Category, string> = {
		normal: '#1F8A70',
		mild: '#CC9A00',
		moderate: '#C2410C',
		severe: '#8F1D4F'
	};
	const BAND_FILL: Record<Category, string> = {
		normal: '#EEF6F4',
		mild: '#FDF6E5',
		moderate: '#FDEEE5',
		severe: '#FBE7EC'
	};
	const BAND_INK: Record<Category, string> = {
		normal: '#1D5E53',
		mild: '#6B4700',
		moderate: '#8A2E0B',
		severe: '#9F1239'
	};
	const BAND_NAME: Record<Category, string> = {
		normal: 'Normaal',
		mild: 'Licht',
		moderate: 'Gemiddeld',
		severe: 'Ernstig'
	};

	const HEIGHT = 280;
	const M = { top: 8, right: 8, bottom: 24, left: 36 };
	const DAY_MONTH = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short' });

	let width = $state(340);
	let active = $state<number | null>(null);

	const plotW = $derived(Math.max(width - M.left - M.right, 10));
	const plotH = HEIGHT - M.top - M.bottom;
	const x = (t: number) => M.left + ((t - data.xMin) / (data.xMax - data.xMin)) * plotW;
	const y = (v: number) => M.top + ((data.yMax - v) / (data.yMax - data.yMin)) * plotH;

	const bands = $derived.by(() => {
		const { mild, moderate, severe } = data.limits;
		const edges: [Category, number, number][] = [
			['normal', data.yMin, mild],
			['mild', mild, moderate],
			['moderate', moderate, severe],
			['severe', severe, data.yMax]
		];
		return edges.map(([category, from, to]) => ({
			category,
			top: y(to),
			height: y(from) - y(to),
			limit: category === 'normal' ? null : from
		}));
	});

	const path = $derived(
		data.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
	);

	const activePoint = $derived(active === null ? null : (data.points[active] ?? null));
	const tooltipText = $derived(
		activePoint
			? `${activePoint.value} mmHg, ${CATEGORY_LABEL[activePoint.category].toLowerCase()}, ${activePoint.label}${activePoint.count > 1 ? `, gemiddelde van ${activePoint.count} metingen` : ''}`
			: ''
	);

	function nearest(clientX: number, target: SVGRectElement): number | null {
		if (data.points.length === 0) return null;
		const box = target.getBoundingClientRect();
		const px = M.left + ((clientX - box.left) / box.width) * plotW;
		let best = 0;
		for (let i = 1; i < data.points.length; i++) {
			if (Math.abs(x(data.points[i].t) - px) < Math.abs(x(data.points[best].t) - px)) best = i;
		}
		return best;
	}

	function onPointer(event: PointerEvent & { currentTarget: SVGRectElement }) {
		active = nearest(event.clientX, event.currentTarget);
	}

	function onKey(event: KeyboardEvent) {
		const last = data.points.length - 1;
		if (last < 0) return;
		const moves: Record<string, number> = {
			ArrowLeft: Math.max((active ?? last + 1) - 1, 0),
			ArrowRight: Math.min((active ?? -1) + 1, last),
			Home: 0,
			End: last
		};
		if (event.key in moves) {
			event.preventDefault();
			active = moves[event.key];
		} else if (event.key === 'Escape') {
			active = null;
		}
	}
</script>

<!-- A slider over the points: arrow keys walk through them and the value text reads each one. -->
<div
	class="chart"
	bind:clientWidth={width}
	role="slider"
	aria-roledescription="grafiek"
	aria-label={label}
	aria-valuemin={1}
	aria-valuemax={data.points.length}
	aria-valuenow={(active ?? data.points.length - 1) + 1}
	aria-valuetext={tooltipText || label}
	aria-describedby="chart-help"
	tabindex="0"
	onkeydown={onKey}
	onfocus={() => (active ??= data.points.length - 1)}
	onblur={() => (active = null)}
>
	<span id="chart-help" class="visually-hidden">Pijltjestoetsen tonen de metingen een voor een.</span>
	<svg {width} height={HEIGHT} viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
		{#each bands as band (band.category)}
			{#if band.height > 0}
				<rect x={M.left} y={band.top} width={plotW} height={band.height} fill={BAND_FILL[band.category]} />
			{/if}
		{/each}

		{#each bands as band (band.category)}
			{#if band.limit !== null}
				<line class="threshold" x1={M.left} x2={M.left + plotW} y1={y(band.limit)} y2={y(band.limit)} stroke={DOT[band.category]} />
				<text class="tick" x={M.left - 6} y={y(band.limit) + 4} text-anchor="end">{band.limit}</text>
			{/if}
		{/each}

		<text class="tick" x={M.left} y={HEIGHT - 6}>{DAY_MONTH.format(data.xMin)}</text>
		<text class="tick" x={M.left + plotW} y={HEIGHT - 6} text-anchor="end">{DAY_MONTH.format(data.xMax - 1)}</text>

		{#if activePoint}
			<line class="crosshair" x1={x(activePoint.t)} x2={x(activePoint.t)} y1={M.top} y2={M.top + plotH} />
		{/if}

		{#if data.points.length > 1}
			<path d={path} class="line" />
		{/if}

		{#each bands as band (band.category)}
			{#if band.height >= 18}
				<text class="band-label" x={M.left + plotW - 6} y={band.top + 14} text-anchor="end" fill={BAND_INK[band.category]} stroke={BAND_FILL[band.category]}>
					{BAND_NAME[band.category]}
				</text>
			{/if}
		{/each}


		{#each data.points as point, i (i)}
			{#if point.dot || data.points.length === 1 || i === active}
				<circle cx={x(point.t)} cy={y(point.value)} r={i === active ? 7 : 5} fill={DOT[point.category]} class="dot" />
			{/if}
		{/each}

		<!-- Hit area: the whole plot, snapping to the nearest point (crosshair). -->
		<rect
			role="presentation"
			class="hit"
			x={M.left}
			y={M.top}
			width={plotW}
			height={plotH}
			onpointermove={onPointer}
			onpointerdown={onPointer}
			onpointerleave={() => (active = null)}
		/>
	</svg>

	{#if activePoint}
		{@const left = Math.min(Math.max(x(activePoint.t), 80), width - 80)}
		<div class="tooltip" style:left="{left}px" aria-hidden="true">
			<div class="tooltip-value">
				<span class="key" style:background={DOT[activePoint.category]}></span>{activePoint.value}
				<span class="unit">mmHg</span>
			</div>
			<div>{CATEGORY_LABEL[activePoint.category]}</div>
			<div class="tooltip-when">
				{activePoint.label}{#if activePoint.count > 1}&nbsp;· {activePoint.count} metingen{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		border-radius: 12px;
	}

	svg {
		display: block;
		touch-action: pan-y;
	}

	/* A halo in the band colour keeps the label readable where the line crosses it. */
	.band-label {
		font-size: 12px;
		font-weight: 700;
		stroke-width: 4px;
		stroke-linejoin: round;
		paint-order: stroke;
	}

	.tick {
		font-size: 12px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	/* Dashed on purpose: these are the category limits, not gridlines. */
	.threshold {
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}

	.line {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.dot {
		stroke: #ffffff;
		stroke-width: 2;
	}

	.crosshair {
		stroke: var(--muted);
		stroke-width: 1;
	}

	.hit {
		fill: transparent;
		cursor: crosshair;
	}

	.tooltip {
		position: absolute;
		top: 4px;
		transform: translateX(-50%);
		min-width: 132px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
		font-size: 14px;
		pointer-events: none;
	}

	.tooltip-value {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 20px;
		font-weight: 700;
	}

	.key {
		width: 12px;
		height: 3px;
		border-radius: 2px;
	}

	.unit {
		font-size: 14px;
		font-weight: 400;
		color: var(--muted);
	}

	.tooltip-when {
		color: var(--muted);
	}
</style>
