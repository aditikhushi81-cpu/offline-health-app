// CSV helpers. Pure functions, so they work offline.

// Quotes a value if needed, doubles inner quotes, and neutralises spreadsheet formulas.
export function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);

    // Excel runs text that starts with = + - @ as a formula. A leading ' makes it plain text.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;

    // Quote when the value has a comma, a quote or a line break
    if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
}

// rows = array of arrays. Returns CSV text with a UTF-8 BOM so Excel opens it correctly.
export function buildCsv(headers, rows) {
    const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// Starts a download of the CSV text in the browser (works offline).
export function downloadCsv(filename, csvText) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}