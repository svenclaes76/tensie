/** Hands the browser a file to save. */
export function download(fileName: string, data: BlobPart, type: string) {
	const url = URL.createObjectURL(new Blob([data], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	// Give the browser a moment to start the download before the URL goes away.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
