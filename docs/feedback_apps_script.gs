/**
 * Google Apps Script web app that appends one feedback row to the sheet it is bound to.
 *
 * Setup (about 5 minutes, no Google Cloud project needed):
 *  1. Create a NEW Google Sheet for feedback (do not reuse the baseline data files).
 *     Name the first tab FEEDBACK. Extensions > Apps Script, paste this file.
 *  2. Project Settings > Script properties > add  FEEDBACK_TOKEN = <long random string>.
 *  3. Deploy > New deployment > type "Web app": Execute as "Me", access "Anyone".
 *  4. Copy the web-app URL into Vercel env FEEDBACK_WEBHOOK_URL, and the same token into FEEDBACK_TOKEN.
 * The token is the only thing protecting the endpoint, so keep it out of the repository.
 */
const COLUMNS = ['submitted_at', 'kind', 'rating', 'reason_tag', 'would_use_again', 'wish_ids', 'place_ids',
                 'trip_id', 'offer_id', 'comment', 'scope', 'data_origin', 'consent'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('FEEDBACK_TOKEN');
    if (!expected || body.token !== expected) return out({ ok: false, error: 'unauthorized' });
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FEEDBACK');
    if (!sheet) return out({ ok: false, error: 'no FEEDBACK tab' });
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);
    const row = body.row || {};
    // Prefix text cells so a value like "=HYPERLINK(...)" can never run as a formula.
    sheet.appendRow(COLUMNS.map((c) => {
      const v = row[c] == null ? '' : String(row[c]);
      return /^[=+\-@]/.test(v) ? "'" + v : v;
    }));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: 'bad request' });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
