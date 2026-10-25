# Test fixtures

`sample-import.xlsx` is synthetic data in the same layout as the owner's real spreadsheet. It contains no real readings.

Expected import result:

- 96 readings, values in cmHg (convert ×10 to mmHg)
- Header on row 2, columns `Maand | Datum | Uur | Onder | Boven` starting in column B
- Row 6 has the note "Start medicatie" in column G
- Row 23 has a date in 2022 (out of sequence) and row 43 a date in 2028 (future): both flagged for confirmation
- The last 6 readings have Onder and Boven stored as text
- Columns K–M on rows 3–6 hold a threshold legend: ignore
- `Blad2` must be ignored
