import { configureTestDatabase, testDatabaseUrl } from './database';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { Server } from 'node:http';
import * as argon2 from 'argon2';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import type { Response as TestResponse } from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureHttp } from '../src/common/http';
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
  users: Array<{ id: string; username: string }>;
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
  let adminId: string,
    aId: string,
    bId: string,
    aUserId: string,
    bUserId: string;
  let adminCookie: string, aCookie: string, bCookie: string;
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
        ...(municipalityId ? { municipalityId } : {}),
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
          areaName: 'منطقة اختبار',
          username: letter + '-' + run,
          password,
        })
        .expect(201);
      const item = body<MunicipalityResponse>(res);
      municipalities.push(item.id);
      users.push(item.users[0].id);
      if (letter === 'a') {
        aId = item.id;
        aUserId = item.users[0].id;
      } else {
        bId = item.id;
        bUserId = item.users[0].id;
      }
    }
    aCookie = await login('a-' + run);
    bCookie = await login('b-' + run);
    aRecord = body<RecordResponse>(
      await unsafe('post', '/records', aCookie).send(recordInput).expect(201),
    );
    bRecord = body<RecordResponse>(
      await unsafe('post', '/records', bCookie)
        .send({
          ...recordInput,
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
      });
    }
    if (app) await app.close();
  });
  it('authenticates with an opaque hashed session and does not expose password material', async () => {
    const res = await request(http)
      .get('/api/auth/me')
      .set('Cookie', aCookie)
      .expect(200);
    expect(body<{ municipalityId: string }>(res).municipalityId).toBe(aId);
    expect(res.body).not.toHaveProperty('passwordHash');
    const raw = aCookie.split('=')[1],
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
      .send({ username: 'a-' + run, password: 'wrong' })
      .expect(401);
    expect(body<{ message: string }>(missing).message).toBe(
      body<{ message: string }>(wrong).message,
    );
  });
  it('rejects unsafe requests with missing or foreign Origin/custom header', async () => {
    await request(http)
      .post('/api/records')
      .set('Cookie', aCookie)
      .send(recordInput)
      .expect(403);
    await request(http)
      .post('/api/records')
      .set('Cookie', aCookie)
      .set('Origin', 'https://evil.example')
      .set('X-Count-Daraa', '1')
      .send(recordInput)
      .expect(403);
    await request(http)
      .post('/api/records')
      .set('Cookie', aCookie)
      .set('Origin', origin)
      .send(recordInput)
      .expect(403);
  });
  it('ignores forged municipality query/header values on lists, counts and lookup searches', async () => {
    const res = await request(http)
      .get('/api/records')
      .query({ municipalityId: bId })
      .set('Cookie', aCookie)
      .set('municipalityId', bId)
      .set('X-Municipality-Id', bId)
      .expect(200);
    const data = body<{ items: RecordResponse[]; total: number }>(res);
    expect(data.items.every((r) => r.municipalityId === aId)).toBe(true);
    expect(data.items.map((r) => r.id)).not.toContain(bRecord.id);
    const search = await request(http)
      .get('/api/records')
      .query({ municipalityId: bId, search: '00002' })
      .set('Cookie', aCookie)
      .expect(200);
    expect(body<{ total: number }>(search).total).toBe(0);
    const summary = await request(http)
      .get('/api/records/summary')
      .set('Cookie', aCookie)
      .set('X-Municipality-Id', bId)
      .expect(200);
    expect(body<{ counts: { MARTYR: number } }>(summary).counts.MARTYR).toBe(1);
  });
  it('filters lists, counts and exports by status while preserving municipality isolation', async () => {
    const statuses = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'];
    const localIds: string[] = [];
    for (const maritalStatus of statuses) {
      const created = await unsafe('post', '/records', aCookie)
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
      await unsafe('post', '/records', bCookie)
        .send({
          ...recordInput,
          category: 'WAR_INJURED',
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
            municipalityId: bId,
          })
          .set('Cookie', aCookie)
          .expect(200);
        const data = body<{ items: RecordResponse[]; total: number }>(filtered);
        expect(data.total).toBe(1);
        expect(data.items.map((item) => item.id)).toEqual([localIds[index]]);
        const book = await readExport(aCookie, bId, {
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
        .set('Cookie', aCookie)
        .expect(400);
      await request(http)
        .get('/api/records/export/xlsx')
        .query({ category: 'WAR_INJURED', maritalStatus: 'unknown' })
        .set('Cookie', aCookie)
        .expect(400);
    } finally {
      for (const id of [...localIds, foreign.id])
        await unsafe('delete', '/records/' + id, adminCookie).expect(200);
    }
  });
  it('does not reveal another municipality record by ID or forged municipality param', async () => {
    await request(http)
      .get('/api/records/' + bRecord.id)
      .set('Cookie', aCookie)
      .expect(404);
    await request(http)
      .get('/api/municipalities/' + bId + '/records')
      .set('Cookie', aCookie)
      .expect(404);
    await request(http)
      .get('/api/records/not-a-uuid')
      .set('Cookie', aCookie)
      .expect(400);
  });
  it('cannot update or delete another municipality record', async () => {
    await unsafe('patch', '/records/' + bRecord.id, aCookie)
      .send({ ...recordInput, municipalityId: bId })
      .expect(404);
    await unsafe('delete', '/records/' + bRecord.id, aCookie).expect(404);
    const item = await db.censusRecord.findUniqueOrThrow({
      where: { id: bRecord.id },
    });
    expect(item.deletedAt).toBeNull();
    expect(item.personName).toBe('اسم سري لبلدية أخرى');
  });
  it('derives municipality on create/update from the session despite a forged body', async () => {
    const created = await unsafe('post', '/records', aCookie)
      .send({ ...recordInput, nationalId: '00002', municipalityId: bId })
      .expect(201);
    const item = body<RecordResponse>(created);
    expect(item.municipalityId).toBe(aId);
    const updated = await unsafe('patch', '/records/' + item.id, aCookie)
      .send({
        ...recordInput,
        nationalId: '00002',
        municipalityId: bId,
        phone: '٠٩٠٠٠٠٠٠٠٠',
      })
      .expect(200);
    expect(body<RecordResponse>(updated).municipalityId).toBe(aId);
  });
  it('cannot import or access any admin endpoint', async () => {
    const file = await workbook();
    await upload('preview', file, aCookie).expect(403);
    await upload('confirm', file, aCookie).expect(403);
    for (const path of [
      '/admin/municipalities',
      '/admin/municipalities/options',
      '/admin/imports',
      '/admin/audit',
    ])
      await request(http)
        .get('/api' + path)
        .set('Cookie', aCookie)
        .expect(403);
    await unsafe('post', '/admin/municipalities', aCookie).send({}).expect(403);
    await unsafe('patch', '/admin/users/' + bUserId, aCookie)
      .send({ isActive: false })
      .expect(403);
    await unsafe('post', '/records/' + bRecord.id + '/restore', aCookie).expect(
      403,
    );
  });
  it('exports only its own records with Arabic headers, RTL, metadata, text identifiers and safe formulas', async () => {
    const book = await readExport(aCookie, bId);
    expect(book.worksheets).toHaveLength(1);
    const sheet = book.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      ...headers('MARTYR').map((h) => h[1]),
    ]);
    expect(sheet.getCell('A1').value).toContain('منطقة اختبار');
    expect(sheet.getCell('A2').value).toContain('بلدية اختبار a-' + run);
    const rows: string[] = [];
    sheet.eachRow((row) => rows.push(JSON.stringify(row.values)));
    expect(rows.join(' ')).not.toContain('اسم سري لبلدية أخرى');
    const exported = sheet.getRow(6);
    expect(exported.getCell(5).type).toBe(ExcelJS.ValueType.String);
    expect(exported.getCell(5).numFmt).toBe('@');
    expect(String(exported.getCell(5).value)).toMatch(/^0000/);
    expect(exported.getCell(6).value).toBe('00045');
    expect(String(exported.getCell(8).value)).toMatch(/^0/);
    expect(exported.getCell(9).value).toBe("'=1+1");
  });
  it('allows admin access across municipalities and filtered/all-municipality exports', async () => {
    await request(http)
      .get('/api/records/' + bRecord.id)
      .set('Cookie', adminCookie)
      .expect(200);
    const res = await request(http)
      .get('/api/records')
      .query({ municipalityId: bId })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      body<{ items: RecordResponse[] }>(res).items.every(
        (r) => r.municipalityId === bId,
      ),
    ).toBe(true);
    const all = await readExport(adminCookie);
    expect(all.worksheets.length).toBeGreaterThanOrEqual(2);
    const exportedMunicipalities = all.worksheets.map((sheet) =>
      String(sheet.getCell('A2').value),
    );
    expect(
      exportedMunicipalities.some((value) =>
        value.includes('بلدية اختبار a-' + run),
      ),
    ).toBe(true);
    expect(
      exportedMunicipalities.some((value) =>
        value.includes('بلدية اختبار b-' + run),
      ),
    ).toBe(true);
    const filtered = await readExport(adminCookie, bId);
    expect(filtered.worksheets).toHaveLength(1);
    expect(filtered.worksheets[0].getCell('A2').value).toContain(
      'بلدية اختبار b-',
    );
  });
  it('enforces pagination and authoritative validation/marital rules', async () => {
    const result = await request(http)
      .get('/api/records')
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', aCookie)
      .expect(200);
    expect(body<{ items: unknown[] }>(result).items).toHaveLength(1);
    await request(http)
      .get('/api/records')
      .query({ pageSize: 101 })
      .set('Cookie', aCookie)
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
      await unsafe('post', '/records', aCookie)
        .send({ ...recordInput, ...changes })
        .expect(400);
    const poverty = await unsafe('post', '/records', aCookie)
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
      const created = await unsafe('post', '/records', aCookie)
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
    const exported = await readExport(aCookie);
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
    await unsafe('post', '/records', aCookie).send(recordInput).expect(409);
    const results = await Promise.all(
      [1, 2].map(() =>
        unsafe('post', '/records', aCookie).send({
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
    const updated = await unsafe('patch', '/records/' + aRecord.id, aCookie)
      .send({
        ...recordInput,
        phone: '0999999999',
        expectedUpdatedAt: aRecord.updatedAt,
      })
      .expect(200);
    await unsafe('patch', '/records/' + aRecord.id, aCookie)
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
    await unsafe('delete', '/records/' + aRecord.id, aCookie).expect(200);
    expect(
      (await db.censusRecord.findUniqueOrThrow({ where: { id: aRecord.id } }))
        .deletedAt,
    ).not.toBeNull();
    await request(http)
      .get('/api/records/' + aRecord.id)
      .set('Cookie', aCookie)
      .expect(404);
    const search = await request(http)
      .get('/api/records')
      .query({ category: 'MARTYR', search: '00001' })
      .set('Cookie', aCookie)
      .expect(200);
    expect(body<{ total: number }>(search).total).toBe(0);
    const book = await readExport(aCookie);
    const ids: unknown[] = [];
    book.worksheets[0].eachRow((row, index) => {
      if (index > 5) ids.push(row.getCell(5).value);
    });
    expect(ids).not.toContain('00001');
    await request(http)
      .get('/api/records')
      .query({ deleted: 'true' })
      .set('Cookie', aCookie)
      .expect(403);
    const replacement = body<RecordResponse>(
      await unsafe('post', '/records', aCookie).send(recordInput).expect(201),
    );
    await unsafe(
      'post',
      '/records/' + aRecord.id + '/restore',
      adminCookie,
    ).expect(409);
    await unsafe('delete', '/records/' + replacement.id, aCookie).expect(200);
    await unsafe(
      'post',
      '/records/' + aRecord.id + '/restore',
      adminCookie,
    ).expect(201);
    await request(http)
      .get('/api/records/' + aRecord.id)
      .set('Cookie', aCookie)
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
    await unsafe('post', '/records', aCookie)
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
    await unsafe('post', '/records', aCookie)
      .send(pair('زوج اختبار', 'زوجة اختبار'))
      .expect(201);
    // Same husband, different wife: a different household, so it imports.
    await unsafe('post', '/records', aCookie)
      .send(pair('زوج اختبار', 'زوجة أخرى'))
      .expect(201);
    // Same wife, different husband: also a different household.
    await unsafe('post', '/records', aCookie)
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
    await unsafe('post', '/records', aCookie)
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
    await unsafe('post', '/records', aCookie)
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
  it('admin updates municipality and adds accounts without exposing hashes', async () => {
    await unsafe('patch', '/admin/municipalities/' + aId, adminCookie)
      .send({ areaName: 'منطقة اختبار معدلة' })
      .expect(200);
    const created = await unsafe(
      'post',
      '/admin/municipalities/' + aId + '/users',
      adminCookie,
    )
      .send({ username: 'extra-' + run, password })
      .expect(201);
    const user = body<{ id: string }>(created);
    users.push(user.id);
    expect(created.body).not.toHaveProperty('passwordHash');
    const before = await db.municipality.count();
    await unsafe('post', '/admin/municipalities', adminCookie)
      .send({
        name: 'بلدية متراجعة-' + run,
        areaName: 'اختبار',
        username: 'a-' + run,
        password,
      })
      .expect(409);
    expect(await db.municipality.count()).toBe(before);
  });
  it('password reset revokes sessions; disabled users and municipalities cannot authenticate or use old sessions', async () => {
    await unsafe('patch', '/admin/users/' + bUserId, adminCookie)
      .send({ password })
      .expect(200);
    await request(http).get('/api/auth/me').set('Cookie', bCookie).expect(401);
    bCookie = await login('b-' + run);
    await unsafe('patch', '/admin/users/' + bUserId, adminCookie)
      .send({ isActive: false })
      .expect(200);
    await request(http).get('/api/auth/me').set('Cookie', bCookie).expect(401);
    await unsafe('post', '/auth/login')
      .send({ username: 'b-' + run, password })
      .expect(401);
    await unsafe('patch', '/admin/users/' + bUserId, adminCookie)
      .send({ isActive: true })
      .expect(200);
    await request(http).get('/api/auth/me').set('Cookie', bCookie).expect(401);
    await unsafe('patch', '/admin/municipalities/' + bId, adminCookie)
      .send({ isActive: false })
      .expect(200);
    await unsafe('post', '/auth/login')
      .send({ username: 'b-' + run, password })
      .expect(401);
    await unsafe('patch', '/admin/municipalities/' + bId, adminCookie)
      .send({ isActive: true })
      .expect(200);
    const disabledHash = createHash('sha256')
      .update(aCookie.split('=')[1])
      .digest('hex');
    await db.user.update({ where: { id: aUserId }, data: { isActive: false } });
    await request(http).get('/api/auth/me').set('Cookie', aCookie).expect(401);
    await db.user.update({ where: { id: aUserId }, data: { isActive: true } });
    await db.session.update({
      where: { tokenHash: disabledHash },
      data: { expiresAt: new Date(0) },
    });
    await request(http).get('/api/auth/me').set('Cookie', aCookie).expect(401);
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
