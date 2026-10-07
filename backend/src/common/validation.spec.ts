import { recordSchema, recordQuerySchema, digits } from './validation';
const base = {
  category: 'MARTYR',
  personName: '  أحمد   سعيد حسين  ',
  familyMembersCount: '٣',
  maritalStatus: 'SINGLE',
  nationalId: '٠٠١٢٣',
  phone: '٠٩٤٤٠٠٠٠٠٠',
};
describe('Record validation', () => {
  it('preserves names and leading zeros while normalizing digits', () => {
    const result = recordSchema.parse(base);
    expect(result.personName).toBe('أحمد سعيد حسين');
    expect(result.nationalId).toBe('00123');
    expect(result.phone).toBe('0944000000');
    expect(result.familyMembersCount).toBe(3);
    expect(digits('۰۱۲٣')).toBe('0123');
  });
  it('clears spouse when single', () =>
    expect(
      recordSchema.parse({ ...base, spouseName: 'قيمة قديمة' }).spouseName,
    ).toBeNull());
  it('requires spouse for married and marital status for martyr/injured', () => {
    expect(
      recordSchema.safeParse({ ...base, maritalStatus: 'MARRIED' }).success,
    ).toBe(false);
    expect(
      recordSchema.safeParse({
        ...base,
        category: 'WAR_INJURED',
        maritalStatus: null,
      }).success,
    ).toBe(false);
    expect(
      recordSchema.parse({
        ...base,
        maritalStatus: 'MARRIED',
        spouseName: 'اسم الزوجة',
      }).spouseName,
    ).toBe('اسم الزوجة');
  });
  it('allows poverty without spouse or marital status', () => {
    expect(
      recordSchema.parse({
        ...base,
        category: 'EXTREME_POVERTY',
        maritalStatus: undefined,
      }).maritalStatus,
    ).toBeNull();
    expect(
      recordSchema.parse({
        ...base,
        category: 'EXTREME_POVERTY',
        spouseName: 'اسم اختياري',
      }).spouseName,
    ).toBe('اسم اختياري');
  });
  it.each(['', '   ', null, undefined])(
    'stores an unknown family count as null (%s)',
    (value) =>
      expect(
        recordSchema.parse({ ...base, familyMembersCount: value })
          .familyMembersCount,
      ).toBeNull(),
  );
  it.each(['عازب', 'عازبة', 'عازبه', 'أعزب', 'اعزب', ' SINGLE '])(
    'accepts single status %s',
    (value) => {
      const parsed = recordSchema.parse({
        ...base,
        maritalStatus: value,
        spouseName: 'قيمة قديمة',
      });
      expect(parsed.maritalStatus).toBe('SINGLE');
      expect(parsed.spouseName).toBeNull();
    },
  );
  it.each(['متزوج', 'متزوجة', ' متزوجه ', ' MARRIED '])(
    'accepts married status %s',
    (value) => {
      expect(
        recordSchema.parse({
          ...base,
          maritalStatus: value,
          spouseName: 'اسم الزوج',
        }).maritalStatus,
      ).toBe('MARRIED');
      expect(
        recordSchema.safeParse({ ...base, maritalStatus: value }).success,
      ).toBe(false);
    },
  );
  it.each([
    ['أرمل', 'WIDOWED'],
    ['أرملة', 'WIDOWED'],
    ['ارمل', 'WIDOWED'],
    ['ارملة', 'WIDOWED'],
    ['ارمله', 'WIDOWED'],
    ['أرمله', 'WIDOWED'],
    ['مطلق', 'DIVORCED'],
    ['مطلقة', 'DIVORCED'],
    ['مطلقه', 'DIVORCED'],
  ])('accepts %s without requiring spouse information', (value, expected) => {
    const parsed = recordSchema.parse({
      ...base,
      maritalStatus: value,
      familyMembersCount: null,
    });
    expect(parsed.maritalStatus).toBe(expected);
    expect(parsed.spouseName).toBeNull();
  });
  it('rejects unsupported marital values rather than silently classifying them', () => {
    expect(
      recordSchema.safeParse({ ...base, maritalStatus: 'قيمة غير معروفة' })
        .success,
    ).toBe(false);
  });
  it('accepts validated status filters and rejects unknown values', () => {
    for (const [value, expected] of [
      ['SINGLE', 'SINGLE'],
      ['متزوجه', 'MARRIED'],
      ['أرمله', 'WIDOWED'],
      ['مطلقه', 'DIVORCED'],
    ])
      expect(
        recordQuerySchema.parse({ maritalStatus: value }).maritalStatus,
      ).toBe(expected);
    expect(recordQuerySchema.parse({}).maritalStatus).toBeUndefined();
    expect(
      recordQuerySchema.safeParse({ maritalStatus: 'unknown' }).success,
    ).toBe(false);
    expect(recordQuerySchema.safeParse({ maritalStatus: null }).success).toBe(
      false,
    );
  });
  it('keeps final ه spelling in people names', () => {
    const result = recordSchema.parse({
      ...base,
      personName: 'اسم ينتهي به',
      maritalStatus: 'متزوجه',
      spouseName: 'اسم آخر به',
    });
    expect(result.personName).toBe('اسم ينتهي به');
    expect(result.spouseName).toBe('اسم آخر به');
  });
  it.each([0, -1, 1.5, 'abc', 10001])(
    'rejects invalid family count %s',
    (value) =>
      expect(
        recordSchema.safeParse({ ...base, familyMembersCount: value }).success,
      ).toBe(false),
  );
  it('rejects unknown fields, invalid category, empty names and numeric identifiers', () => {
    for (const input of [
      { ...base, createdById: 'forged' },
      { ...base, category: 'OTHER' },
      { ...base, personName: ' ' },
      { ...base, nationalId: 123 },
    ])
      expect(recordSchema.safeParse(input).success).toBe(false);
  });
});
