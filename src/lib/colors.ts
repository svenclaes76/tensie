import type { Category } from './domain/types';

/**
 * Category colours for marks (chart dots, settings swatches). Checked with the dataviz palette
 * validator: colour-blind and normal-vision separation pass; amber is below 3:1 on white, so it
 * always appears next to a label, band or table.
 */
export const CATEGORY_MARK: Record<Category, string> = {
	normal: '#1F8A70',
	mild: '#CC9A00',
	moderate: '#C2410C',
	severe: '#8F1D4F'
};
