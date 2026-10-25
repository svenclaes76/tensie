import type { Page } from '@playwright/test';

export interface Seed {
	at: string;
	systolic: number;
	diastolic: number;
	note?: string;
	deleted?: boolean;
}

/** Writes readings straight into the app's IndexedDB, then reloads so the list reads them. */
export async function seed(page: Page, readings: Seed[]) {
	await page.goto('/list');
	// Wait until the app has opened (and so created) its database.
	await page.getByText('Nog geen metingen.').waitFor();
	await page.evaluate(async (rows) => {
		await new Promise<void>((resolve, reject) => {
			const open = indexedDB.open('tensie');
			open.onerror = () => reject(open.error);
			open.onsuccess = () => {
				let tx: IDBTransaction;
				try {
					tx = open.result.transaction('readings', 'readwrite');
				} catch (error) {
					open.result.close();
					reject(error);
					return;
				}
				const store = tx.objectStore('readings');
				rows.forEach((r, i) => {
					const at = new Date(r.at).toISOString();
					store.put({
						id: `seed-${i}`,
						measuredAt: at,
						timeZone: 'Europe/Brussels',
						systolic: r.systolic,
						diastolic: r.diastolic,
						...(r.note ? { note: r.note } : {}),
						source: 'manual',
						createdAt: at,
						updatedAt: at,
						deleted: r.deleted ?? false
					});
				});
				tx.oncomplete = () => {
					open.result.close();
					resolve();
				};
				tx.onerror = () => reject(tx.error);
			};
		});
	}, readings);
	await page.reload();
}

/** Readings as stored in IndexedDB. */
export async function stored(page: Page): Promise<Record<string, unknown>[]> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('tensie');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('readings').objectStore('readings').getAll();
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				};
			})
	);
}
