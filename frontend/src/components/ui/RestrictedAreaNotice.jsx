import React from "react";
import { ShieldAlert } from "lucide-react";
import Badge from "./Badge";
import Card from "./Card";

export default function RestrictedAreaNotice({
  title = "Área restrita",
  description = "Dados sensíveis devem ser acessados apenas por perfis autorizados.",
  badgeLabel = "Financeiro",
}) {
  return (
    <Card className="p-4 border-amber-200 bg-amber-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <ShieldAlert size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-extrabold text-amber-900 m-0">{title}</h2>
            <Badge tone="amber">{badgeLabel}</Badge>
          </div>
          <p className="text-sm text-amber-800 mt-1 mb-0">{description}</p>
        </div>
      </div>
    </Card>
  );
}
