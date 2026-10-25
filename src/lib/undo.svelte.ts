/** C7: a deletion can be undone for this long. */
export const UNDO_SECONDS = 10;

interface PendingUndo {
	readingId: string;
	/** Epoch ms after which the offer is gone. */
	until: number;
}

/**
 * The deletion that can still be undone. It lives outside any page so the offer survives the
 * navigation from the edit screen back to the list.
 */
export const undo = $state<{ pending: PendingUndo | null }>({ pending: null });

export function offerUndo(readingId: string, now = Date.now()) {
	undo.pending = { readingId, until: now + UNDO_SECONDS * 1000 };
}

export function clearUndo() {
	undo.pending = null;
}
