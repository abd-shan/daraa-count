import { useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { resetApiState, useLogoutMutation, useSessionQuery } from "./api";
import { useAppDispatch } from "./store";
import { clearAllDrafts } from "./drafts";
import { Confirmation, ErrorState, Loading } from "./components/ui";
import { BottomBar, Sidebar } from "./components/Nav";
import { navItems } from "./components/navItems";
import { LogoutIcon } from "./components/icons";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Records } from "./pages/Records";
import { Municipalities } from "./pages/Municipalities";
import { Imports } from "./pages/Imports";
import { Audit } from "./pages/Audit";
export default function App() {
  const dispatch = useAppDispatch();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const session = useSessionQuery();
  const [logout] = useLogoutMutation();
  if (session.isLoading) return <Loading />;
  if (session.isError)
    return (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  if (!session.data)
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  const user = session.data;
  const admin = user.role === "SUPER_ADMIN";
  const home = admin ? "/admin" : "/";
  const items = navItems(user);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        تخطَّ إلى المحتوى
      </a>
      <header className="site-header">
        <div className="header-content">
          <NavLink className="brand" to={home}>
            <span className="brand-logo" aria-hidden="true" />
            <span>
              منصة إحصاء محافظة درعا<small>نظام اللجان البلدية</small>
            </span>
          </NavLink>
          <div className="header-account">
            <span className="header-identity">
              {admin ? "مسؤول النظام" : user.municipality?.name}
              <small>
                <bdi dir="ltr">{user.username}</bdi>
              </small>
            </span>
            <button
              className="secondary header-logout"
              onClick={() => setConfirmLogout(true)}
            >
              <LogoutIcon />
              <span className="header-logout-label">تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </header>
      <div className="app-body">
        <Sidebar items={items} />
        <main className="container" id="main">
          <Routes>
            <Route path="/login" element={<Navigate to={home} replace />} />
            <Route
              path="/"
              element={
                admin ? <Navigate to="/admin" replace /> : <Home user={user} />
              }
            />
            <Route
              path="/martyrs"
              element={<Records key="martyrs" user={user} category="MARTYR" />}
            />
            <Route
              path="/injured"
              element={
                <Records key="injured" user={user} category="WAR_INJURED" />
              }
            />
            <Route
              path="/poverty"
              element={
                <Records key="poverty" user={user} category="EXTREME_POVERTY" />
              }
            />
            {admin && (
              <>
                <Route path="/admin" element={<Home user={user} />} />
                <Route
                  path="/admin/records"
                  element={<Records user={user} />}
                />
                <Route
                  path="/admin/municipalities"
                  element={<Municipalities />}
                />
                <Route path="/admin/imports" element={<Imports />} />
                <Route path="/admin/audit" element={<Audit />} />
              </>
            )}
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
          <footer className="site-footer">
            <span>محافظة درعا · منصة الإحصاء</span>
            <span>البيانات مخصصة للاستخدام الإداري المصرّح به</span>
          </footer>
        </main>
      </div>
      <BottomBar items={items} />
      {confirmLogout && (
        <Confirmation
          title="تسجيل الخروج"
          message="هل تريد إنهاء جلسة الدخول؟ سيتم إغلاق الجلسة على الخادم، وستُحذف أي مسودات غير محفوظة."
          label="تسجيل الخروج"
          onClose={() => setConfirmLogout(false)}
          onConfirm={async () => {
            await logout().unwrap();
            // Drop every cached response and every unsent draft: no personal
            // data from a finished session may stay in the browser.
            dispatch(resetApiState());
            clearAllDrafts();
            setConfirmLogout(false);
          }}
        />
      )}
    </div>
  );
}
