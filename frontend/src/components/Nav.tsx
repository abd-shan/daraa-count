import { NavLink } from "react-router-dom";
import type { NavItem } from "./navItems";

/** Desktop and tablet: a persistent sidebar on the inline-start (right in RTL). */
export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <nav className="sidebar" aria-label="التنقل الرئيسي">
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Phones: a fixed bottom bar, the pattern people already know from mobile
 * applications. Large targets, an icon plus a short label, and it stays put
 * while the page scrolls.
 */
export function BottomBar({ items }: { items: NavItem[] }) {
  return (
    <nav className="bottom-bar" aria-label="التنقل الرئيسي">
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} title={item.label}>
              {item.icon}
              <span>{item.short}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
