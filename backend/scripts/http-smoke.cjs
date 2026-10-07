// Run after browser-smoke.cjs seed/serve and Vite. All data is synthetic.
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { headers } = require('../dist/excel/headers');
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../.tmp/browser-fixture.json'),
    'utf8',
  ),
);
const origin = process.env.SMOKE_APP_ORIGIN || 'http://localhost:5173';
async function api(route, cookie, method = 'GET', input) {
  const multipart = input instanceof FormData;
  const response = await fetch(origin + '/api' + route, {
    signal: AbortSignal.timeout(15000),
    method,
    headers: {
      Origin: origin,
      'X-Count-Daraa': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(input && !multipart ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(input ? { body: multipart ? input : JSON.stringify(input) } : {}),
  });
  if (!response.ok)
    throw Error('HTTP smoke failed: ' + route + ' status ' + response.status);
  return response;
}
async function main() {
  for (const route of ['/', '/login', '/martyrs', '/admin/imports']) {
    const html = await (await fetch(origin + route)).text();
    if (!html.includes('lang="ar" dir="rtl"'))
      throw Error('RTL SPA entry missing');
  }
  await api('/health');
  const signIn = async (username) => {
    const result = await api('/auth/login', '', 'POST', {
      username,
      password: fixture.password,
    });
    const cookieHeader = result.headers.getSetCookie()[0];
    if (!cookieHeader || !cookieHeader.includes('HttpOnly') || !cookieHeader.includes('SameSite=Strict') ||
      (origin.startsWith('https:') && !cookieHeader.includes('Secure')))
      throw Error('Session cookie attributes are incorrect');
    const cookie = cookieHeader.split(';')[0];
    if (!cookie) throw Error('No session cookie');
    return cookie;
  };
  const municipalityCookie = await signIn(fixture.municipalityUsername);
  const summary = await (
    await api('/records/summary', municipalityCookie)
  ).json();
  if (summary.counts.MARTYR !== 1) throw Error('Wrong category total');
  const file = await api(
    '/records/export/xlsx?category=MARTYR',
    municipalityCookie,
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await file.arrayBuffer()));
  if (
    !book.worksheets[0].views[0].rightToLeft ||
    book.worksheets[0].getCell('E6').value !== '0012345'
  )
    throw Error('Export RTL/leading zeros lost');
  const denied = await fetch(origin + '/api/admin/imports', {
    headers: { Cookie: municipalityCookie },
  });
  if (denied.status !== 403) throw Error('Admin isolation failed');
  const input = {
    category: 'WAR_INJURED',
    personName: 'اسم مصطنع لفحص الاستقرار',
    maritalStatus: 'مطلقة',
    familyMembersCount: '',
    nationalId: '0001234567',
  };
  const created = await (await api('/records', municipalityCookie, 'POST', input)).json();
  if (created.familyMembersCount !== null || created.maritalStatus !== 'DIVORCED')
    throw Error('Optional count or additional marital status failed');
  const edited = await (await api('/records/' + created.id, municipalityCookie, 'PATCH', {
    ...input,
    personName: 'اسم مصطنع بعد التعديل',
    maritalStatus: 'أرملة',
    expectedUpdatedAt: created.updatedAt,
  })).json();
  if (edited.maritalStatus !== 'WIDOWED') throw Error('Record edit failed');
  await api('/records/' + created.id, municipalityCookie, 'DELETE');
  const deleted = await fetch(origin + '/api/records/' + created.id, { headers: { Cookie: municipalityCookie } });
  if (deleted.status !== 404) throw Error('Soft deletion lookup failed');
  await api('/auth/logout', municipalityCookie, 'POST');
  const signedOut = await fetch(origin + '/api/auth/me', { headers: { Cookie: municipalityCookie } });
  if (signedOut.status !== 401) throw Error('Logout revocation failed');
  const adminCookie = await signIn(fixture.adminUsername);
  const importBook = new ExcelJS.Workbook(),
    sheet = importBook.addWorksheet('اختبار');
  sheet.addRow(headers('MARTYR').map((h) => h[1]));
  sheet.addRow([
    1,
    'اسم استيراد مصطنع',
    'أرملة',
    '',
    '0009876',
    '000044',
    '',
    '٠٩٤٤٠٠٠٠٠٠',
    '',
  ]);
  const buffer = Buffer.from(await importBook.xlsx.writeBuffer());
  const upload = () => {
    const form = new FormData();
    form.set('municipalityId', fixture.municipalityId);
    form.set('category', 'MARTYR');
    form.set(
      'file',
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'test.xlsx',
    );
    return form;
  };
  const preview = await (
    await api('/admin/imports/preview', adminCookie, 'POST', upload())
  ).json();
  if (preview.validRows !== 1 || !preview.canConfirm)
    throw Error('Import preview failed');
  const result = await (
    await api('/admin/imports/confirm', adminCookie, 'POST', upload())
  ).json();
  if (result.importedRows !== 1) throw Error('Import confirm failed');
  const repeated = await (await api('/admin/imports/preview', adminCookie, 'POST', upload())).json();
  if (repeated.validRows !== 0 || repeated.duplicateRows !== 1)
    throw Error('Duplicate import handling failed');
  await api('/admin/audit', adminCookie);
  await api('/auth/logout', adminCookie, 'POST');
  console.log(
    'Built frontend/backend same-origin smoke passed: sessions, CRUD, null counts, marital aliases, role isolation, Arabic export, import and duplicates.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
