// Opens `text` alone on a clean page and the browser's print dialog, where "Save as PDF" makes
// the file to attach or the copy to post. Returns false if the browser blocked the new window.
export function printText(title: string, text: string): boolean {
  const page = window.open("", "_blank");
  if (!page) return false;
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  page.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  body { font: 12pt/1.5 "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif; margin: 2cm; color: #000; }
  pre { white-space: pre-wrap; font: inherit; margin: 0; }
</style>
</head>
<body><pre>${escape(text)}</pre></body>
</html>`);
  page.document.close();
  page.focus();
  page.print();
  return true;
}
