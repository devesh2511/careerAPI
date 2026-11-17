// Reads an institute's student list: an .xlsx (first sheet) or a .csv, with
// a name column and a phone column. A header row ("Name", "Phone no.") is
// used when present to find the columns, else name is the first column and
// phone the second. Blank rows are skipped.
//
// → { rows: [{ line, name, phoneNo }], errors: [{ line, reason, value }] }
// `line` is the row number as the admin sees it in Excel (1 = first row).
import { readSheet } from 'read-excel-file/node';
import { ApiError } from '../DTO/ApiError.js';
import { normName, normPhone, NAME_MAX } from '../DTO/auth.requests.js';

export const MAX_ROWS = 20000;

const isZip = buf => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
const cellText = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(Math.trunc(v)) : String(v));

// Minimal CSV: commas or semicolons, double-quoted fields with "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const sep = (text.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readRows(buf) {
  if (isZip(buf)) {
    try {
      return await readSheet(buf);
    } catch {
      throw new ApiError(400, 'bad_file', "We couldn't read that file. Upload an .xlsx or .csv file.");
    }
  }
  const text = buf.toString('utf8').replace(/^﻿/, '');
  if (text.includes('\u0000')) {
    throw new ApiError(400, 'bad_file', "We couldn't read that file. Upload an .xlsx or .csv file.");
  }
  return parseCsv(text);
}

// The name and phone column indexes from a header row, or null when the row
// isn't a header.
function headerColumns(row) {
  const cells = row.map(v => cellText(v).trim().toLowerCase());
  const phone = cells.findIndex(c => /phone|mobile|contact|number/.test(c));
  const name = cells.findIndex((c, i) => i !== phone && /name/.test(c));
  return phone >= 0 && name >= 0 ? { name, phone } : null;
}

export async function parseStudentList(buf) {
  if (!buf || !buf.length) throw new ApiError(400, 'empty_file', 'The file is empty.');
  const all = await readRows(buf);

  const first = all.findIndex(r => r.some(v => cellText(v).trim()));
  if (first < 0) throw new ApiError(400, 'empty_file', 'The file has no students in it.');
  const header = headerColumns(all[first]);
  const cols = header || { name: 0, phone: 1 };
  const start = header ? first + 1 : first;

  const rows = [], errors = [], seen = new Map();
  for (let i = start; i < all.length; i++) {
    const r = all[i];
    if (!r.some(v => cellText(v).trim())) continue;
    const line = i + 1;
    const rawName = cellText(r[cols.name]), rawPhone = cellText(r[cols.phone]);
    const name = normName(rawName);
    const phoneNo = normPhone(r[cols.phone]);
    if (!name) { errors.push({ line, reason: 'Name is missing.', value: rawPhone }); continue; }
    if (name.length > NAME_MAX) { errors.push({ line, reason: `Name is longer than ${NAME_MAX} characters.`, value: rawName }); continue; }
    if (!phoneNo) {
      errors.push({ line, reason: 'Phone number must be a 10-digit mobile number.', value: `${name}, ${rawPhone}` });
      continue;
    }
    const key = `${phoneNo}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ line, reason: `Same name and phone as row ${seen.get(key)}.`, value: `${name}, ${phoneNo}` });
      continue;
    }
    seen.set(key, line);
    rows.push({ line, name, phoneNo });
    if (rows.length > MAX_ROWS) throw new ApiError(400, 'too_many_rows', `A list can have at most ${MAX_ROWS} students.`);
  }
  if (!rows.length && !errors.length) throw new ApiError(400, 'empty_file', 'The file has no students in it.');
  return { rows, errors };
}
