import type { ReactNode } from "react";
import type { User } from "../types";
import {
  AuditIcon,
  HomeIcon,
  ImportIcon,
  InjuredIcon,
  MartyrIcon,
  MunicipalityIcon,
  PovertyIcon,
  RecordsIcon,
  SummaryIcon,
} from "./icons";

export interface NavItem {
  to: string;
  label: string;
  /** Short form for the bottom bar, where width is tight. */
  short: string;
  icon: ReactNode;
  end?: boolean;
}

export function navItems(user: User): NavItem[] {
  if (user.role === "SUPER_ADMIN")
    return [
      {
        to: "/admin",
        label: "الملخص",
        short: "الملخص",
        icon: <SummaryIcon />,
        end: true,
      },
      {
        to: "/admin/municipalities",
        label: "البلديات",
        short: "البلديات",
        icon: <MunicipalityIcon />,
      },
      {
        to: "/admin/records",
        label: "السجلات",
        short: "السجلات",
        icon: <RecordsIcon />,
      },
      {
        to: "/admin/imports",
        label: "استيراد Excel",
        short: "استيراد",
        icon: <ImportIcon />,
      },
      {
        to: "/admin/audit",
        label: "سجل التدقيق",
        short: "التدقيق",
        icon: <AuditIcon />,
      },
    ];
  return [
    {
      to: "/",
      label: "الصفحة الرئيسية",
      short: "الرئيسية",
      icon: <HomeIcon />,
      end: true,
    },
    {
      to: "/martyrs",
      label: "شهداء الثورة",
      short: "الشهداء",
      icon: <MartyrIcon />,
    },
    {
      to: "/injured",
      label: "مصابو الحرب",
      short: "المصابون",
      icon: <InjuredIcon />,
    },
    {
      to: "/poverty",
      label: "الأشد فقراً",
      short: "الأشد فقراً",
      icon: <PovertyIcon />,
    },
  ];
}
