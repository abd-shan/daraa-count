/**
 * Inline SVG icons.
 *
 * Written by hand rather than pulled from an icon package: the set is small,
 * and the project takes no external font or script. Each icon is decorative —
 * the label beside it carries the meaning — so they are `aria-hidden` and the
 * accessible name always comes from real text or an `aria-label`.
 */
import type { SVGProps } from "react";
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  width: "1.4em",
  height: "1.4em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};
export const HomeIcon = () => (
  <svg {...base}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);
export const MartyrIcon = () => (
  <svg {...base}>
    <path d="M12 21s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.7-7 10-7 10Z" />
  </svg>
);
export const InjuredIcon = () => (
  <svg {...base}>
    <path d="M12 3v18M3 12h18" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);
export const PovertyIcon = () => (
  <svg {...base}>
    <path d="M3 21h18" />
    <path d="M6 21V9l6-5 6 5v12" />
    <path d="M10 21v-5h4v5" />
  </svg>
);
export const MunicipalityIcon = () => (
  <svg {...base}>
    <path d="M3 21h18M4 21V8l8-5 8 5v13" />
    <path d="M9 21v-7h6v7" />
    <path d="M9 11h.01M15 11h.01" />
  </svg>
);
export const RecordsIcon = () => (
  <svg {...base}>
    <path d="M5 3h9l5 5v13H5z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 13h7M8.5 17h5" />
  </svg>
);
export const ImportIcon = () => (
  <svg {...base}>
    <path d="M12 3v11" />
    <path d="M8 10.5 12 14.5l4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
export const AuditIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4.3-4.3" />
    <path d="M11 8v3l2 1.5" />
  </svg>
);
export const SummaryIcon = () => (
  <svg {...base}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const LogoutIcon = () => (
  <svg {...base}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8 6 12l4 4" />
    <path d="M6 12h9" />
  </svg>
);
export const EyeIcon = () => (
  <svg {...base}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const EyeOffIcon = () => (
  <svg {...base}>
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-2.7 3.4" />
    <path d="M6.5 7.8A17.6 17.6 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 3.9-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </svg>
);
export const MenuIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
