import { Link } from "react-router-dom";
import { useSummaryQuery } from "../api";
import type { User } from "../types";
import {
  categories,
  categoryLabels,
  categoryPaths,
  numberText,
} from "../types";
import {
  CategoryCard,
  ErrorState,
  Loading,
  PageHeader,
} from "../components/ui";
export function Home({ user }: { user: User }) {
  const summary = useSummaryQuery();
  const admin = user.role === "SUPER_ADMIN";
  const counts = summary.data?.counts ?? {};
  const total = categories.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
  return (
    <>
      <PageHeader
        title={admin ? "ملخص الإحصاء" : (user.municipality?.name ?? "البلدية")}
        subtitle={
          admin
            ? "متابعة بيانات البلديات وإدارة الحسابات"
            : user.municipality?.areaName
        }
      />
      {summary.isLoading ? (
        <Loading />
      ) : summary.isError ? (
        <ErrorState
          error={summary.error}
          retry={() => void summary.refetch()}
        />
      ) : (
        <>
          {admin ? (
            <div className="stat-strip">
              <dl>
                <div>
                  <dt>عدد البلديات</dt>
                  <dd>{numberText(summary.data?.municipalityCount ?? 0)}</dd>
                </div>
                <div>
                  <dt>إجمالي السجلات</dt>
                  <dd>{numberText(total)}</dd>
                </div>
              </dl>
              <Link className="secondary" to="/admin/municipalities">
                إدارة البلديات والحسابات
              </Link>
            </div>
          ) : (
            <p className="section-intro">
              اختر نوع الإحصاء لعرض السجلات أو إضافة سجل جديد.
            </p>
          )}
          <div className="category-grid">
            {categories.map((c) => (
              <CategoryCard
                key={c}
                title={categoryLabels[c]}
                count={counts[c] ?? 0}
                to={admin ? "/admin/records?category=" + c : categoryPaths[c]}
              />
            ))}
          </div>
          {admin && (
            <div className="shortcuts">
              <Link className="secondary" to="/admin/imports">
                استيراد Excel
              </Link>
              <Link className="secondary" to="/admin/audit">
                سجل التدقيق
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
