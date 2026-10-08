import { configureTestDatabase, testDatabaseUrl } from './database';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import type { Server } from 'node:http';
import * as argon2 from 'argon2';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import type { Response as TestResponse } from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureHttp } from '../src/common/http';
import { readConfig } from '../src/config';
import { headers } from '../src/excel/headers';
configureTestDatabase();
process.env.MAX_IMPORT_ROWS = '3';
process.env.MAX_IMPORT_FILE_MB = '1';
jest.setTimeout(30000);
const origin = 'http://localhost:5173';
const password = 'Test-only-password-12345';
const run = randomUUID().slice(0, 8);
const recordInput = {
  category: 'MARTYR',
  personName: 'اسم تجريبي غير حقيقي',
  maritalStatus: 'SINGLE',
  nationalId: '00001',
  familyBookNumber: '00045',
  familyMembersCount: 3,
  phone: '0944000000',
  notes: '=1+1',
};
interface RecordResponse {
  id: string;
  municipalityId: string;
  personName: string;
  nationalId: string;
  updatedAt: string;
  deletedAt: string | null;
}
interface MunicipalityResponse {
  id: string;
}
interface PreviewResponse {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  canConfirm: boolean;
}
const body = <T>(res: TestResponse) => res.body as T;
async function workbook(
  ids = ['٠٠٠٧٧', '٠٠٠٧٧', '٠٠٠٨٨'],
  invalid = false,
  wrongHeaders = false,
  // Duplicate detection is by person/spouse name pair, so a test that imports
  // rows must use its own names to stay independent of execution order.
  namePrefix = 'اسم اختبار ',
) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('إحصاء');
  sheet.addRow(['المنطقة: بيانات اختبار']);
  sheet.addRow([]);
  const labels = headers('MARTYR').map((h) => h[1]);
  if (wrongHeaders) labels[4] = 'عمود غير معتمد';
  sheet.addRow(labels);
  ids.forEach((id, index) =>
    sheet.addRow([
      index + 1,
      namePrefix + index,
      'عازب',
      '',
      id,
      '٠٠٠٤٥',
      invalid ? 'خطأ' : '٣',
      '٠٩٤٤٠٠٠٠٠٠',
      '',
    ]),
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
/**
 * A workbook of married rows, built from explicit husband/wife name pairs,
 * so a test can state exactly which pairs it expects to be duplicates.
 */
async function pairWorkbook(pairs: Array<[string, string]>) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('إحصاء');
  sheet.addRow(['المنطقة: بيانات اختبار']);
  sheet.addRow([]);
  sheet.addRow(headers('MARTYR').map((h) => h[1]));
  pairs.forEach(([person, spouse], index) =>
    sheet.addRow([
      index + 1,
      person,
      'متزوج',
      spouse,
      '',
      '٠٠٠٤٥',
      '٣',
      '٠٩٤٤٠٠٠٠٠٠',
      '',
    ]),
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
const binary = (
  res: TestResponse,
  callback: (error: Error | null, body?: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error) => callback(error));
};
describe('V1 real PostgreSQL HTTP integration', () => {
  let app: INestApplication, db: PrismaService, http: Server;
  let adminId: string, aId: string, bId: string, legacyUserId: string;
  let adminCookie: string, legacyCookie: string;
  let aRecord: RecordResponse, bRecord: RecordResponse;
  const municipalities: string[] = [],
    users: string[] = [];
  const unsafe = (
    method: 'post' | 'patch' | 'delete',
    path: string,
    cookie?: string,
  ) => {
    const req = request(http)[method]('/api' + path);
    req.set('Origin', origin).set('X-Count-Daraa', '1');
    if (
      cookie === adminCookie &&
      (method === 'post' || method === 'patch') &&
      (path === '/records' || /^\/records\/[^/]+$/.test(path))
    )
      req.send({ municipalityId: aId });
    return cookie ? req.set('Cookie', cookie) : req;
  };
  async function login(username: string) {
    const res = await unsafe('post', '/auth/login')
      .send({ username, password })
      .expect(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Strict');
    return cookies[0].split(';')[0];
  }
  const upload = (
    path: string,
    file: Buffer,
    cookie = adminCookie,
    extra: Record<string, string> = {},
  ) =>
    unsafe('post', '/admin/imports/' + path, cookie)
      .field('municipalityId', aId)
      .field('category', 'MARTYR')
      .field(extra)
      .attach('file', file, {
        filename: 'اختبار.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
  async function readExport(
    cookie: string,
    municipalityId?: string,
    filters: Record<string, string> = {},
  ) {
    const res = await request(http)
      .get('/api/records/export/xlsx')
      .query({
        category: 'MARTYR',
        ...filters,
        ...(municipalityId ? { municipalityId } : { municipalityId: aId }),
      })
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as ExcelJS.Buffer);
    return book;
  }
  async function verifyCleanupSafety() {
    if (new URL(testDatabaseUrl()).pathname !== '/count_daraa_test')
      throw Error('Unsafe cleanup configuration');
    const result = await db.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    if (result[0]?.name !== 'count_daraa_test')
      throw Error('Refusing cleanup outside count_daraa_test');
  }
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, {
      logger: false,
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
    db = app.get(PrismaService);
    http = app.getHttpServer() as Server;
    await verifyCleanupSafety();
    const admin = await db.user.create({
      data: {
        username: 'admin-' + run,
        role: 'SUPER_ADMIN',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    adminId = admin.id;
    users.push(adminId);
    adminCookie = await login(admin.username);
    for (const letter of ['a', 'b']) {
      const res = await unsafe('post', '/admin/municipalities', adminCookie)
        .send({
          name: 'بلدية اختبار ' + letter + '-' + run,
          areaName: 'منطقة اختبار-' + run,
        })
        .expect(201);
      const item = body<MunicipalityResponse>(res);
      municipalities.push(item.id);
      if (letter === 'a') {
        aId = item.id;
      } else {
        bId = item.id;
      }
    }
    const legacy = await db.user.create({
      data: {
        username: 'legacy-' + run,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: 'MUNICIPALITY',
        municipalityId: aId,
        isActive: true,
      },
    });
    legacyUserId = legacy.id;
    users.push(legacy.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId: legacy.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    legacyCookie = readConfig().SESSION_COOKIE_NAME + '=' + token;
    aRecord = body<RecordResponse>(
      await unsafe('post', '/records', adminCookie)
        .send(recordInput)
        .expect(201),
    );
    bRecord = body<RecordResponse>(
      await unsafe('post', '/records', adminCookie)
        .send({
          ...recordInput,
          municipalityId: bId,
          personName: 'اسم سري لبلدية أخرى',
          nationalId: '00002',
        })
        .expect(201),
    );
  });
  afterAll(async () => {
    if (db) {
      await verifyCleanupSafety();
      // Remove only synthetic records created by this suite, in the guarded test database.
      await db.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { userId: { in: users } },
              { municipalityId: { in: municipalities } },
            ],
          },
        });
        await tx.importBatch.deleteMany({
          where: { municipalityId: { in: municipalities } },
        });
        await tx.censusRecord.deleteMany({
          where: { municipalityId: { in: municipalities } },
        });
        await tx.session.deleteMany({ where: { userId: { in: users } } });
        await tx.user.deleteMany({ where: { id: { in: users } } });
        await tx.municipality.deleteMany({
          where: { id: { in: municipalities } },
        });
        await tx.area.deleteMany({
          where: {
            name: { endsWith: '-' + run },
            municipalities: { none: {} },
          },
        });
      });
    }
    if (app) await app.close();
  });
  it('authenticates with an opaque hashed session and does not expose password material', async () => {
    const res = await request(http)
      .get('/api/auth/me')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ role: string }>(res).role).toBe('SUPER_ADMIN');
    expect(res.body).not.toHaveProperty('passwordHash');
    const raw = adminCookie.split('=')[1],
      hashed = createHash('sha256').update(raw).digest('hex');
    expect(
      await db.session.findUnique({ where: { tokenHash: hashed } }),
    ).not.toBeNull();
    expect(
      await db.session.findUnique({ where: { tokenHash: raw } }),
    ).toBeNull();
    await request(http).get('/api/records').expect(401);
  });
  it('returns the same generic error for missing accounts and wrong passwords', async () => {
    const missing = await unsafe('post', '/auth/login')
      .send({ username: 'nonexistent-' + run, password })
      .expect(401);
    const wrong = await unsafe('post', '/auth/login')
      .send({ username: 'admin-' + run, password: 'wrong' })
      .expect(401);
    expect(body<{ message: string }>(missing).message).toBe(
      body<{ message: string }>(wrong).message,
    );
  });
  it('rejects unsafe requests with missing or foreign Origin/custom header', async () => {
    await request(http)
      .post('/api/records')
      .set('Cookie', adminCookie)
      .send(recordInput)
      .expect(403);
    await request(http)
      .post('/api/records')
      .set('Cookie', adminCookie)
      .set('Origin', 'https://evil.example')
      .set('X-Count-Daraa', '1')
      .send(recordInput)
      .expect(403);
    await request(http)
      .post('/api/records')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send(recordInput)
      .expect(403);
  });
  it('blocks legacy municipality login and all existing-session operations without losing records', async () => {
    await unsafe('post', '/auth/login')
      .send({ username: 'legacy-' + run, password })
      .expect(401);
    for (const route of [
      '/auth/me',
      '/records',
      '/records/summary',
      '/records/' + bRecord.id,
      '/records/export/xlsx?category=MARTYR',
      '/admin/municipalities',
      '/admin/areas',
    ])
      await request(http)
        .get('/api' + route)
        .set('Cookie', legacyCookie)
        .expect(401);
    await unsafe('post', '/records', legacyCookie)
      .send({ ...recordInput, municipalityId: bId })
      .expect(401);
    await unsafe('patch', '/records/' + bRecord.id, legacyCookie)
      .send(recordInput)
      .expect(401);
    await unsafe('delete', '/records/' + bRecord.id, legacyCookie).expect(401);
    const file = await workbook();
    await upload('preview', file, legacyCookie).expect(401);
    await upload('confirm', file, legacyCookie).expect(401);
    expect(
      await db.user.findUnique({ where: { id: legacyUserId } }),
    ).not.toBeNull();
    expect(
      await db.censusRecord.findUnique({ where: { id: aRecord.id } }),
    ).not.toBeNull();
  });
  it('removes account creation and activation endpoints', async () => {
    await unsafe('post', '/admin/municipalities/' + aId + '/users', adminCookie)
      .send({ username: 'extra-' + run, password })
      .expect(404);
    await unsafe('patch', '/admin/users/' + legacyUserId, adminCookie)
      .send({ isActive: true })
      .expect(404);
  });
  it('administrator can select a municipality and export Arabic, RTL and leading-zero identifiers', async () => {
    const result = await request(http)
      .get('/api/records')
      .query({ municipalityId: bId })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      body<{ items: RecordResponse[] }>(result).items.map((item) => item.id),
    ).toEqual([bRecord.id]);
    const book = await readExport(adminCookie, aId);
    expect(book.worksheets).toHaveLength(1);
    const sheet = book.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getCell('E6').value).toBe('00001');
    expect(sheet.getCell('F6').value).toBe('00045');
    expect(sheet.getCell('I6').value).toBe("'=1+1");
    await request(http)
      .get('/api/records/not-a-uuid')
      .set('Cookie', adminCookie)
      .expect(400);
  });
  it('filters lists, counts and exports by status while preserving municipality isolation', async () => {
    const statuses = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'];
    const localIds: string[] = [];
    for (const maritalStatus of statuses) {
      const created = await unsafe('post', '/records', adminCookie)
        .send({
          ...recordInput,
          category: 'WAR_INJURED',
          maritalStatus,
          nationalId: null,
          spouseName: maritalStatus === 'MARRIED' ? 'اسم زوج اختبار' : null,
        })
        .expect(201);
      localIds.push(body<RecordResponse>(created).id);
    }
    const foreign = body<RecordResponse>(
      await unsafe('post', '/records', adminCookie)
        .send({
          ...recordInput,
          category: 'WAR_INJURED',
          municipalityId: bId,
          nationalId: null,
        })
        .expect(201),
    );
    try {
      for (const [index, maritalStatus] of statuses.entries()) {
        const filtered = await request(http)
          .get('/api/records')
          .query({
            category: 'WAR_INJURED',
            maritalStatus,
            municipalityId: aId,
          })
          .set('Cookie', adminCookie)
          .expect(200);
        const data = body<{ items: RecordResponse[]; total: number }>(filtered);
        expect(data.total).toBe(1);
        expect(data.items.map((item) => item.id)).toEqual([localIds[index]]);
        const book = await readExport(adminCookie, aId, {
          category: 'WAR_INJURED',
          maritalStatus,
        });
        expect(book.worksheets).toHaveLength(1);
        expect(book.worksheets[0].rowCount).toBe(6);
        expect(book.worksheets[0].getCell('C6').value).toBe(
          ['عازب/عازبة', 'متزوج/متزوجة', 'أرمل/أرملة', 'مطلق/مطلقة'][index],
        );
      }
      const admin = await request(http)
        .get('/api/records')
        .query({
          category: 'WAR_INJURED',
          maritalStatus: 'SINGLE',
          municipalityId: bId,
        })
        .set('Cookie', adminCookie)
        .expect(200);
      expect(
        body<{ items: RecordResponse[] }>(admin).items.map((item) => item.id),
      ).toEqual([foreign.id]);
      await request(http)
        .get('/api/records')
        .query({ maritalStatus: 'unknown' })
        .set('Cookie', adminCookie)
        .expect(400);
      await request(http)
        .get('/api/records/export/xlsx')
        .query({ category: 'WAR_INJURED', maritalStatus: 'unknown' })
        .set('Cookie', adminCookie)
        .expect(400);
    } finally {
      for (const id of [...localIds, foreign.id])
        await unsafe('delete', '/records/' + id, adminCookie).expect(200);
    }
  });
  it('enforces pagination and authoritative validation/marital rules', async () => {
    const result = await request(http)
      .get('/api/records')
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ items: unknown[] }>(result).items).toHaveLength(1);
    await request(http)
      .get('/api/records')
      .query({ pageSize: 101 })
      .set('Cookie', adminCookie)
      .expect(400);
    for (const changes of [
      { familyMembersCount: 0 },
      { familyMembersCount: 1.2 },
      { maritalStatus: 'MARRIED', spouseName: '' },
      { category: 'WAR_INJURED', maritalStatus: null },
      { personName: '' },
      { nationalId: 123 },
      { createdById: adminId },
    ])
      await unsafe('post', '/records', adminCookie)
        .send({ ...recordInput, ...changes })
        .expect(400);
    const poverty = await unsafe('post', '/records', adminCookie)
      .send({
        ...recordInput,
        category: 'EXTREME_POVERTY',
        maritalStatus: null,
      })
      .expect(201);
    expect(body<{ maritalStatus: null }>(poverty).maritalStatus).toBeNull();
  });
  it('persists blank family counts and accepts feminine marital labels', async () => {
    for (const [index, status] of [
      'عازبة',
      'متزوجة',
      'أرملة',
      'مطلقة',
    ].entries()) {
      const created = await unsafe('post', '/records', adminCookie)
        .send({
          ...recordInput,
          nationalId: '0090' + index,
          maritalStatus: status,
          spouseName: status === 'متزوجة' ? 'اسم الزوج' : null,
          familyMembersCount: '',
        })
        .expect(201);
      const item = body<
        RecordResponse & { familyMembersCount: null; maritalStatus: string }
      >(created);
      expect(item.familyMembersCount).toBeNull();
      expect(item.maritalStatus).toBe(
        ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'][index],
      );
      expect(
        (await db.censusRecord.findUniqueOrThrow({ where: { id: item.id } }))
          .familyMembersCount,
      ).toBeNull();
    }
    const exported = await readExport(adminCookie);
    for (const [index, nationalId] of [
      '00900',
      '00901',
      '00902',
      '00903',
    ].entries()) {
      let found = false;
      exported.worksheets[0].eachRow((row) => {
        if (row.getCell(5).value === nationalId) {
          found = true;
          expect([null, '']).toContain(row.getCell(7).value);
          expect(row.getCell(3).value).toBe(
            ['عازب/عازبة', 'متزوج/متزوجة', 'أرمل/أرملة', 'مطلق/مطلقة'][index],
          );
        }
      });
      expect(found).toBe(true);
    }
  });
  it('prevents duplicates in the same scope and serializes simultaneous creates', async () => {
    await unsafe('post', '/records', adminCookie).send(recordInput).expect(409);
    const results = await Promise.all(
      [1, 2].map(() =>
        unsafe('post', '/records', adminCookie).send({
          ...recordInput,
          nationalId: '00066',
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.censusRecord.count({
        where: { municipalityId: aId, category: 'MARTYR', nationalId: '00066' },
      }),
    ).toBe(1);
  });
  it('rejects stale edits and audits changed fields without sensitive values', async () => {
    const updated = await unsafe('patch', '/records/' + aRecord.id, adminCookie)
      .send({
        ...recordInput,
        phone: '0999999999',
        expectedUpdatedAt: aRecord.updatedAt,
      })
      .expect(200);
    await unsafe('patch', '/records/' + aRecord.id, adminCookie)
      .send({ ...recordInput, expectedUpdatedAt: aRecord.updatedAt })
      .expect(409);
    aRecord = body<RecordResponse>(updated);
    const logs = await db.auditLog.findMany({
      where: { action: 'RECORD_UPDATE', entityId: aRecord.id },
    });
    expect(logs[0].metadata).toEqual({
      changedFields: ['phone'],
      category: 'MARTYR',
    });
    expect(JSON.stringify(logs)).not.toContain('0999999999');
  });
  it('soft deletes, excludes deleted records from lookup/count/export/duplicates, and admin restores', async () => {
    await unsafe('delete', '/records/' + aRecord.id, adminCookie).expect(200);
    expect(
      (await db.censusRecord.findUniqueOrThrow({ where: { id: aRecord.id } }))
        .deletedAt,
    ).not.toBeNull();
    await request(http)
      .get('/api/records/' + aRecord.id)
      .set('Cookie', adminCookie)
      .expect(404);
    const search = await request(http)
      .get('/api/records')
      .query({ municipalityId: aId, category: 'MARTYR', search: '00001' })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ total: number }>(search).total).toBe(0);
    const book = await readExport(adminCookie);
    const ids: unknown[] = [];
    book.worksheets[0].eachRow((row, index) => {
      if (index > 5) ids.push(row.getCell(5).value);
    });
    expect(ids).not.toContain('00001');
    await request(http)
      .get('/api/records')
      .query({ deleted: 'true' })
      .set('Cookie', adminCookie)
      .expect(200);
    const replacement = body<RecordResponse>(
      await unsafe('post', '/records', adminCookie)
        .send(recordInput)
        .expect(201),
    );
    await unsafe(
      'post',
      '/records/' + aRecord.id + '/restore',
      adminCookie,
    ).expect(409);
    await unsafe('delete', '/records/' + replacement.id, adminCookie).expect(
      200,
    );
    await unsafe(
      'post',
      '/records/' + aRecord.id + '/restore',
      adminCookie,
    ).expect(201);
    await request(http)
      .get('/api/records/' + aRecord.id)
      .set('Cookie', adminCookie)
      .expect(200);
  });
  it('preview is read-only and reports Arabic workbook duplicates', async () => {
    const before = {
      records: await db.censusRecord.count(),
      imports: await db.importBatch.count(),
      audits: await db.auditLog.count(),
    };
    // Two rows carry the same husband/wife pair, so the second is the one
    // duplicate; the third pair differs by the wife's name and is valid.
    const res = await upload(
      'preview',
      await pairWorkbook([
        ['زوج معاينة', 'زوجة معاينة'],
        ['زوج معاينة', 'زوجة معاينة'],
        ['زوج معاينة', 'زوجة مختلفة'],
      ]),
    ).expect(201);
    expect(body<PreviewResponse>(res)).toMatchObject({
      totalRows: 3,
      validRows: 2,
      invalidRows: 0,
      duplicateRows: 1,
      canConfirm: true,
    });
    expect({
      records: await db.censusRecord.count(),
      imports: await db.importBatch.count(),
      audits: await db.auditLog.count(),
    }).toEqual(before);
  });
  it('previews and imports feminine statuses with unknown family counts', async () => {
    const file = await workbook(['00911', '00912', '00913']);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ExcelJS.Buffer);
    const sheet = book.worksheets[0];
    sheet.getCell('C4').value = 'أرملة';
    sheet.getCell('C5').value = 'مطلقة';
    sheet.getCell('C6').value = 'عازبة';
    sheet.getCell('G4').value = null;
    sheet.getCell('G5').value = null;
    sheet.getCell('G6').value = null;
    const original = Buffer.from(await book.xlsx.writeBuffer());
    const before = await db.censusRecord.count();
    const preview = await upload('preview', original).expect(201);
    expect(body<PreviewResponse>(preview)).toMatchObject({
      validRows: 3,
      invalidRows: 0,
      canConfirm: true,
    });
    expect(await db.censusRecord.count()).toBe(before);
    const confirmed = await upload('confirm', original).expect(201);
    expect(body<{ importedRows: number }>(confirmed).importedRows).toBe(3);
    const imported = await db.censusRecord.findMany({
      where: {
        municipalityId: aId,
        nationalId: { in: ['00911', '00912', '00913'] },
      },
    });
    expect(imported).toHaveLength(3);
    expect(imported.every((record) => record.familyMembersCount === null)).toBe(
      true,
    );
    expect(imported.map((record) => record.maritalStatus).sort()).toEqual([
      'DIVORCED',
      'SINGLE',
      'WIDOWED',
    ]);
    const repeated = await upload('preview', original).expect(201);
    expect(body<PreviewResponse>(repeated)).toMatchObject({
      validRows: 0,
      duplicateRows: 3,
    });
  });
  it('confirmation revalidates altered file and rejects malformed workbook without partial writes', async () => {
    await upload('preview', await workbook()).expect(201);
    const before = await db.censusRecord.count();
    await upload('confirm', await workbook(['00077', '00088'], true)).expect(
      400,
    );
    await upload('preview', await workbook(['00077'], false, true)).expect(400);
    await upload('confirm', Buffer.from('invalid zip')).expect(400);
    await upload('preview', await workbook(['1', '2', '3', '4'])).expect(400);
    await unsafe('post', '/admin/imports/preview', adminCookie)
      .field('municipalityId', aId)
      .field('category', 'MARTYR')
      .attach('file', Buffer.alloc(1024 * 1024 + 1), {
        filename: 'large.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(413);
    expect(await db.censusRecord.count()).toBe(before);
  });
  it('confirm imports distinct name pairs, scopes rows, and audits the transaction', async () => {
    await upload('preview', await workbook()).expect(201);
    // A repeated national ID no longer makes a row a duplicate: identity is
    // the person/spouse name pair, and this record's name matches no row.
    await unsafe('post', '/records', adminCookie)
      .send({ ...recordInput, nationalId: '00077' })
      .expect(201);
    const sheet = await workbook(
      ['٠٠٠٧٧', '٠٠٠٧٧', '٠٠٠٨٨'],
      false,
      false,
      'اسم تسلسل ',
    );
    const res = await upload('confirm', sheet).expect(201);
    const result = body<{
      importedRows: number;
      duplicateRows: number;
      batchId: string;
    }>(res);
    // Three rows with three different person names and no spouse: all import,
    // even though two of them share the national ID 00077.
    expect(result).toMatchObject({ importedRows: 3, duplicateRows: 0 });
    const imported = await db.censusRecord.findMany({
      where: { nationalId: '00088', municipalityId: aId },
    });
    expect(imported).toHaveLength(1);
    expect(imported[0].phone).toBe('0944000000');
    expect(imported[0].createdById).toBe(adminId);
    expect(
      await db.censusRecord.count({
        where: { nationalId: '00088', municipalityId: bId },
      }),
    ).toBe(0);
    const batch = await db.importBatch.findUniqueOrThrow({
      where: { id: result.batchId },
    });
    expect(batch.importedRows).toBe(3);
    expect(batch.fileChecksum).toHaveLength(64);
    expect(
      await db.auditLog.findFirst({
        where: { action: 'IMPORT', entityId: batch.id },
      }),
    ).not.toBeNull();
    // Re-confirming the same file now matches all three pairs it just wrote.
    const repeated = await upload('confirm', sheet).expect(201);
    expect(
      body<{ importedRows: number; duplicateRows: number }>(repeated),
    ).toMatchObject({ importedRows: 0, duplicateRows: 3 });
  });
  it('treats a matching person/spouse name pair as the duplicate, and any other difference as a new household', async () => {
    const pair = (personName: string, spouseName: string) => ({
      ...recordInput,
      maritalStatus: 'MARRIED',
      nationalId: null,
      personName,
      spouseName,
      notes: '',
    });
    // An existing household: husband and wife both named.
    await unsafe('post', '/records', adminCookie)
      .send(pair('زوج اختبار', 'زوجة اختبار'))
      .expect(201);
    // Same husband, different wife: a different household, so it imports.
    await unsafe('post', '/records', adminCookie)
      .send(pair('زوج اختبار', 'زوجة أخرى'))
      .expect(201);
    // Same wife, different husband: also a different household.
    await unsafe('post', '/records', adminCookie)
      .send(pair('زوج آخر', 'زوجة اختبار'))
      .expect(201);
    const both = await db.censusRecord.count({
      where: {
        municipalityId: aId,
        personName: 'زوج اختبار',
        deletedAt: null,
      },
    });
    expect(both).toBe(2);
    // Only the exact pair is refused by the importer.
    const sheet = await pairWorkbook([
      ['زوج اختبار', 'زوجة اختبار'],
      ['زوج اختبار', 'زوجة ثالثة'],
      // A second identical pair inside one workbook is skipped too.
      ['زوج اختبار', 'زوجة ثالثة'],
    ]);
    const preview = await upload('preview', sheet).expect(201);
    expect(body<PreviewResponse>(preview)).toMatchObject({
      validRows: 1,
      duplicateRows: 2,
    });
    const confirmed = await upload('confirm', sheet).expect(201);
    expect(
      body<{ importedRows: number; duplicateRows: number }>(confirmed),
    ).toMatchObject({ importedRows: 1, duplicateRows: 2 });
  });
  it('skips a row whose person and spouse names both match an existing record', async () => {
    await unsafe('post', '/records', adminCookie)
      .send({
        ...recordInput,
        nationalId: null,
        personName: 'اسم اختبار 0',
        notes: '',
      })
      .expect(201);
    const preview = await upload('preview', await workbook([''])).expect(201);
    expect(body<PreviewResponse>(preview)).toMatchObject({
      validRows: 0,
      duplicateRows: 1,
    });
    const confirmed = await upload('confirm', await workbook([''])).expect(201);
    expect(
      body<{ importedRows: number; duplicateRows: number }>(confirmed),
    ).toMatchObject({ importedRows: 0, duplicateRows: 1 });
    await unsafe('post', '/records', adminCookie)
      .send({
        ...recordInput,
        nationalId: null,
        personName: 'اسم اختبار 0',
        phone: '0900000000',
        notes: '',
      })
      .expect(201);
  });
  it('rejects unauthorized file-supplied municipality fields', async () => {
    await upload('confirm', await workbook(), adminCookie, {
      effectiveMunicipalityId: bId,
    }).expect(400);
  });
  it('rolls back record insertion and import history if audit persistence fails', async () => {
    await verifyCleanupSafety();
    const name = 'test_import_fail_' + run;
    const before = {
      records: await db.censusRecord.count(),
      batches: await db.importBatch.count(),
    };
    // This failure injection is installed only in the guarded test database.
    await db.$executeRawUnsafe(
      'CREATE FUNCTION "' +
        name +
        '"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = \'IMPORT\' AND NEW."userId" = \'' +
        adminId +
        "'::uuid THEN RAISE EXCEPTION 'synthetic test failure'; END IF; RETURN NEW; END $$",
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER "' +
        name +
        '" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "' +
        name +
        '"()',
    );
    try {
      const res = await upload('confirm', await workbook(['00099'])).expect(
        500,
      );
      expect(JSON.stringify(res.body)).not.toContain('synthetic test failure');
      expect({
        records: await db.censusRecord.count(),
        batches: await db.importBatch.count(),
      }).toEqual(before);
    } finally {
      await verifyCleanupSafety();
      await db.$executeRawUnsafe('DROP TRIGGER "' + name + '" ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION "' + name + '"()');
    }
  });
  it('database constraints protect role mapping, positive counts and marital consistency', async () => {
    await expect(
      db.user.create({
        data: {
          username: 'invalid-' + run,
          role: 'MUNICIPALITY',
          passwordHash: 'test',
        },
      }),
    ).rejects.toThrow();
    for (const changes of [
      { familyMembersCount: 0 },
      { maritalStatus: 'MARRIED' as const, spouseName: null },
      { maritalStatus: 'SINGLE' as const, spouseName: 'must not remain' },
    ]) {
      await expect(
        db.censusRecord.create({
          data: {
            ...recordInput,
            category: 'MARTYR',
            maritalStatus: 'SINGLE',
            ...changes,
            municipalityId: aId,
            createdById: adminId,
          },
        }),
      ).rejects.toThrow();
    }
  });
  it('admin history endpoints paginate audit/import events without password or session material', async () => {
    const auditRes = await request(http)
      .get('/api/admin/audit')
      .query({ action: 'IMPORT', pageSize: 1 })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ items: unknown[] }>(auditRes).items).toHaveLength(1);
    expect(JSON.stringify(auditRes.body)).not.toContain(password);
    expect(JSON.stringify(auditRes.body)).not.toContain(adminCookie);
    const history = await request(http)
      .get('/api/admin/imports')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ total: number }>(history).total).toBeGreaterThan(0);
  });
  it('creates municipalities without users and persists unique, sorted areas for future statistics', async () => {
    const initialUsers = await db.user.count();
    const areaName = 'منطقة جديدة-' + run;
    for (const suffix of ['one', 'two']) {
      const result = await unsafe('post', '/admin/municipalities', adminCookie)
        .send({
          name: 'بلدية ' + suffix + '-' + run,
          areaName: '  ' + areaName + '  ',
        })
        .expect(201);
      municipalities.push(body<MunicipalityResponse>(result).id);
      expect(result.body).not.toHaveProperty('users');
      expect(result.body).not.toHaveProperty('passwordHash');
    }
    expect(await db.user.count()).toBe(initialUsers);
    expect(await db.area.count({ where: { name: areaName } })).toBe(1);
    await unsafe('patch', '/admin/municipalities/' + aId, adminCookie)
      .send({ areaName: 'منطقة معدلة-' + run })
      .expect(200);
    const areas = await request(http)
      .get('/api/admin/areas')
      .set('Cookie', adminCookie)
      .expect(200);
    const names = body<string[]>(areas);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ar')));
    expect(names).toContain(areaName);
    expect(names).toContain('منطقة اختبار-' + run);
    expect(names).toContain('منطقة معدلة-' + run);
    const search = await request(http)
      .get('/api/admin/municipalities')
      .query({ search: areaName })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(body<{ total: number }>(search).total).toBe(2);
    await unsafe('post', '/admin/municipalities', adminCookie)
      .send({ name: 'بلدية one-' + run, areaName: 'منطقة متراجعة-' + run })
      .expect(409);
    expect(
      await db.area.findUnique({ where: { name: 'منطقة متراجعة-' + run } }),
    ).toBeNull();
    await unsafe('post', '/admin/municipalities', adminCookie)
      .send({ name: 'blank', areaName: '' })
      .expect(400);
    await unsafe('post', '/admin/municipalities', adminCookie)
      .send({ name: 'credentials', areaName, username: 'unwanted', password })
      .expect(400);
    const list = await request(http)
      .get('/api/admin/municipalities')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    expect(
      body<{ items: Array<{ users?: unknown }> }>(list).items.every(
        (item) => item.users === undefined,
      ),
    ).toBe(true);
  });
  it('disabling municipalities preserves records and blocks new administrator entry until re-enabled', async () => {
    await unsafe('patch', '/admin/municipalities/' + bId, adminCookie)
      .send({ isActive: false })
      .expect(200);
    await unsafe('post', '/records', adminCookie)
      .send({ ...recordInput, nationalId: 'disabled', municipalityId: bId })
      .expect(400);
    await request(http)
      .get('/api/records/' + bRecord.id)
      .set('Cookie', adminCookie)
      .expect(200);
    await unsafe('patch', '/admin/municipalities/' + bId, adminCookie)
      .send({ isActive: true })
      .expect(200);
  });
  it('logout revokes the opaque session and clears its cookie', async () => {
    const res = await unsafe('post', '/auth/logout', adminCookie).expect(201);
    expect(String(res.headers['set-cookie'])).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    await request(http)
      .get('/api/auth/me')
      .set('Cookie', adminCookie)
      .expect(401);
    expect(
      await db.auditLog.findFirst({
        where: { action: 'LOGOUT', userId: adminId },
      }),
    ).not.toBeNull();
  });
  it('rate limits repeated failed logins', async () => {
    let status = 0;
    for (let i = 0; i < 12; i++) {
      const res = await unsafe('post', '/auth/login').send({
        username: 'missing-' + run,
        password,
      });
      status = res.status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});
