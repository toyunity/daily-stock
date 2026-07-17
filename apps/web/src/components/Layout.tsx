import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const navItems = [
  { to: "/", label: "오늘의 리포트", end: true },
  { to: "/reports", label: "아카이브" },
  { to: "/settings", label: "설정" },
];

export function Layout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            📈 Daily Stock
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition ${
                    isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {profile?.role === "admin" && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition ${
                    isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                  }`
                }
              >
                관리자
              </NavLink>
            )}
            <button
              onClick={signOut}
              className="ml-2 rounded-md px-3 py-1.5 text-slate-400 hover:text-white"
            >
              로그아웃
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
