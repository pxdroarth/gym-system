import React from "react";
import { ShieldAlert } from "lucide-react";
import Badge from "./Badge";
import Card from "./Card";

const toneMap = {
  amber: {
    card: "border-amber-200 bg-amber-50",
    icon: "bg-amber-100 text-amber-700",
    title: "text-amber-900",
    description: "text-amber-800",
    badge: "amber",
  },
  blue: {
    card: "border-blue-200 bg-blue-50/80",
    icon: "bg-blue-100 text-blue-700",
    title: "text-blue-950",
    description: "text-blue-800",
    badge: "blue",
  },
  gray: {
    card: "border-slate-200 bg-slate-50/90",
    icon: "bg-slate-200 text-slate-700",
    title: "text-slate-900",
    description: "text-slate-700",
    badge: "gray",
  },
};

export default function RestrictedAreaNotice({
  title = "Area restrita",
  description = "Dados sensiveis devem ser acessados apenas por perfis autorizados.",
  badgeLabel = "Financeiro",
  tone = "amber",
}) {
  const palette = toneMap[tone] || toneMap.amber;

  return (
    <Card className={`p-4 ${palette.card}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${palette.icon}`}>
          <ShieldAlert size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`font-extrabold m-0 ${palette.title}`}>{title}</h2>
            <Badge tone={palette.badge}>{badgeLabel}</Badge>
          </div>
          <p className={`text-sm mt-1 mb-0 ${palette.description}`}>{description}</p>
        </div>
      </div>
    </Card>
  );
}
