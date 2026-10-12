import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CalendarDays, NotebookPen, PenLine, User } from "./doodles";
import { useAppStore } from "../store/useAppStore";

/**
 * 三个一级导航：今天 / 回顾 / 我的。
 * 原首页、每日记录、每日结果与 AI 助手都合并进「今天」，没有独立入口。
 * 图标全部来自手绘素材库，选中态统一用淡色块 + 细描边。
 */
const NAV = [
  { to: "/today", label: "今天", icon: PenLine },
  { to: "/review", label: "回顾", icon: CalendarDays },
  { to: "/profile", label: "我的", icon: User },
];

export default function AppLayout() {
  const { pathname } = useLocation();
  const onboarded = useAppStore((s) => s.onboarded);
  const current = NAV.find((n) => pathname.startsWith(n.to));
  return (
    <div className="min-h-full bg-[var(--color-bg)] md:flex">
      {/* 桌面端：左侧窄导航 */}
      <aside className="no-print hidden w-52 shrink-0 border-r border-[var(--color-line)] bg-[var(--color-surface)] md:flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center border-[1.5px] border-[var(--color-stroke)] bg-[var(--color-accent-yellow)] text-[var(--color-ink)]"
            style={{ borderRadius: "10px 8px 11px 8px / 8px 11px 8px 10px" }}
          >
            <NotebookPen size={17} />
          </span>
          <span className="hand text-sm leading-tight font-semibold text-[var(--color-ink)]">
            今天你想离职了吗？
          </span>
        </div>
        <nav aria-label="主导航" className="flex flex-col gap-1 px-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `kbd-focus flex items-center gap-2.5 px-3 py-2 text-sm transition ${
                    isActive
                      ? "border-[1.4px] border-[var(--color-stroke)] bg-[var(--color-accent-blue)] font-medium text-[var(--color-ink)]"
                      : "border-[1.4px] border-transparent text-[var(--color-muted)] hover:bg-[var(--color-fill)] hover:text-[var(--color-ink)]"
                  }`
                }
                style={{ borderRadius: "11px 9px 12px 9px / 9px 12px 9px 11px" }}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <p className="faint mt-auto px-4 py-4 leading-relaxed">
          本地工作区 · 可选择本机磁盘备份
          <br />模型配置与隐私授权在「我的」
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
        {/* 移动端：三项底部导航，h-14 与今天页输入框的吸附位置对齐 */}
        <nav
          aria-label="主导航"
          className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface)] md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {onboarded && (
            <div className="mx-auto flex h-14 max-w-3xl items-stretch gap-1 px-2 py-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = current?.to === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`kbd-focus flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition ${
                      active
                        ? "border-[1.4px] border-[var(--color-stroke)] bg-[var(--color-accent-blue)] font-medium text-[var(--color-ink)]"
                        : "border-[1.4px] border-transparent text-[var(--color-muted)]"
                    }`}
                    style={{
                      borderRadius: "12px 10px 13px 10px / 10px 13px 10px 12px",
                    }}
                  >
                    <Icon size={19} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          )}
        </nav>
      </main>
    </div>
  );
}
