import type { CensusRecord } from "../types";
import { dateText, maritalLabels, numberText } from "../types";
export function RecordsTable({
  records,
  admin,
  deleted,
  onEdit,
  onDelete,
  onRestore,
}: {
  records: CensusRecord[];
  admin: boolean;
  deleted: boolean;
  onEdit: (record: CensusRecord) => void;
  onDelete: (record: CensusRecord) => void;
  onRestore: (record: CensusRecord) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">الاسم</th>
            {admin && <th scope="col">البلدية</th>}
            <th scope="col">رقم البطاقة الشخصية</th>
            <th scope="col">عدد أفراد الأسرة</th>
            <th scope="col">رقم الجوال</th>
            <th scope="col">{deleted ? "تاريخ الحذف" : "الإجراءات"}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                {r.personName}
                {r.maritalStatus && (
                  <>
                    {" "}
                    <span className="badge neutral">
                      {maritalLabels[r.maritalStatus]}
                    </span>
                  </>
                )}
                {r.spouseName && (
                  <small className="row-sub">الزوجة: {r.spouseName}</small>
                )}
              </th>
              {admin && <td data-label="البلدية">{r.municipality.name}</td>}
              <td className="cell-number" data-label="رقم البطاقة الشخصية">
                <bdi dir="ltr">{r.nationalId || "—"}</bdi>
              </td>
              <td className="cell-number" data-label="عدد أفراد الأسرة">
                {r.familyMembersCount === null ? "—" : numberText(r.familyMembersCount)}
              </td>
              <td className="cell-number" data-label="رقم الجوال">
                <bdi dir="ltr">{r.phone || "—"}</bdi>
              </td>
              <td className="cell-actions">
                {deleted ? (
                  <div className="row-actions">
                    <span className="muted">
                      {r.deletedAt ? dateText(r.deletedAt) : "—"}
                    </span>
                    <button
                      className="secondary button-small"
                      onClick={() => onRestore(r)}
                      aria-label={"استعادة سجل " + r.personName}
                    >
                      استعادة
                    </button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button
                      className="secondary button-small"
                      onClick={() => onEdit(r)}
                      aria-label={"عرض وتعديل سجل " + r.personName}
                    >
                      عرض / تعديل
                    </button>
                    <button
                      className="danger button-small"
                      onClick={() => onDelete(r)}
                      aria-label={"حذف سجل " + r.personName}
                    >
                      حذف
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
