import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ */
/* Shared look for every Vatican Cake Point PDF                        */
/* ------------------------------------------------------------------ */
const BASE_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1F1612; margin: 0; padding: 18px; font-size: 12.5px; line-height: 1.45; }
  .doc { max-width: 720px; margin: 0 auto; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #B08D57; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
  .report { color: #B08D57; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; margin-top: 4px; font-weight: 700; }
  .meta { text-align: right; font-size: 11.5px; color: #6B5F57; line-height: 1.6; }
  .meta strong { color: #1F1612; }
  h2 { font-size: 14px; margin: 26px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #ECE6DD; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; letter-spacing: 0.6px; text-transform: uppercase; color: #6B5F57; padding: 7px 8px; background: #F5EEE2; }
  td { padding: 8px; border-bottom: 1px solid #ECE6DD; vertical-align: middle; }
  tr { page-break-inside: avoid; }
  .right { text-align: right; } .muted { color: #6B5F57; font-size: 11px; }
  .tiles { display: flex; gap: 10px; }
  .tile { flex: 1; background: #F5EEE2; border-radius: 10px; padding: 12px 14px; }
  .tile .l { font-size: 11px; color: #6B5F57; } .tile .v { font-size: 19px; font-weight: 800; margin-top: 3px; letter-spacing: -0.3px; }
  .bar { background: #F5EEE2; border-radius: 5px; height: 10px; }
  .bar > i { display: block; background: #B08D57; border-radius: 5px; height: 10px; }
  .note { margin-top: 18px; padding: 12px 14px; background: #FDF1EF; border-radius: 10px; color: #B42318; font-size: 12px; }
  .foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ECE6DD; color: #6B5F57; font-size: 11px; text-align: center; }
`;

/**
 * Wraps report content in the branded page: "Vatican Cake Point" is the
 * masthead at the top of the first page, then the report title, then the
 * details (who it is for, period, date) on the right.
 */
export function pdfDocument(opts: {
  title: string;
  meta?: [label: string, value: string][];
  body: string;
  footer?: string;
}): string {
  const meta = (opts.meta ?? [])
    .map(([label, value]) => `<div>${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(opts.title)}</title>
    <style>${BASE_CSS}</style></head><body><div class="doc">
      <div class="masthead">
        <div><div class="brand">Vatican Cake Point</div><div class="report">${escapeHtml(opts.title)}</div></div>
        <div class="meta">${meta}</div>
      </div>
      ${opts.body}
      <div class="foot">${escapeHtml(opts.footer ?? "Thank you for choosing Vatican Cake Point.")}</div>
    </div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Turning HTML into a real PDF the user can save or share             */
/* ------------------------------------------------------------------ */

// Browsers drop background colours when printing unless told otherwise
const PRINT_FIXES = `<style>@page{size:A4;margin:12mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>`;

function withPrintFixes(html: string, title: string) {
  const head = `<title>${escapeHtml(title)}</title>${PRINT_FIXES}`;
  return html.includes("</head>") ? html.replace("</head>", `${head}</head>`) : `<html><head>${head}</head><body>${html}</body></html>`;
}

/**
 * Web: expo-print's printAsync ignores the HTML and prints the current page
 * (that is what produces a "screenshot"). Printing the HTML inside a hidden
 * iframe prints only the report; choose "Save as PDF" in the print dialog.
 */
function printHtmlOnWeb(html: string, title: string) {
  const doc = (globalThis as any).document;
  if (!doc) throw new Error("Printing is not available here.");

  const iframe = doc.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.srcdoc = withPrintFixes(html, title);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  doc.body.appendChild(iframe);
}

/**
 * Creates the PDF and opens the share sheet (phone) or print dialog (web).
 * Returns false when sharing is unavailable on the device.
 */
export async function sharePdf(
  html: string,
  opts: { filename: string; dialogTitle?: string }
): Promise<boolean> {
  if (Platform.OS === "web") {
    printHtmlOnWeb(html, opts.filename);
    return true;
  }

  const { uri } = await Print.printToFileAsync({ html: withPrintFixes(html, opts.filename), width: 595, height: 842 });

  // Give the file a readable name instead of a random temporary one
  let finalUri = uri;
  try {
    const target = new File(Paths.cache, `${opts.filename}.pdf`);
    if (target.exists) target.delete();
    new File(uri).move(target);
    finalUri = target.uri;
  } catch {
    /* keep the temporary file name */
  }

  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(finalUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: opts.dialogTitle ?? opts.filename,
  });
  return true;
}