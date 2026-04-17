import React from "react";
import { ResponsiveBar }   from "@nivo/bar";
import { ResponsivePie }   from "@nivo/pie";
import { ResponsiveLine }  from "@nivo/line";

/* =======================================================
   BARRA EMPILHADA : Receita × Pendências × Vendas
   ======================================================= */
export function GraficoBarraReceitaPendenciasVendas({ data, periodo }) {
  return (
    <ResponsiveBar
      data={data}
      keys={["Receita", "Pendencias", "Vendas"]}
      indexBy="periodo"
      margin={{ top: 20, right: 30, bottom: 40, left: 70 }}
      padding={0.3}
      innerPadding={2}
      groupMode="stacked"
      colors={d => {
        switch (d.id) {
          case "Receita":    return "#22c55e";   // verde
          case "Pendencias": return "#ef4444";   // vermelho
          default:           return "#3b82f6";   // azul
        }
      }}
      borderRadius={4}
      axisLeft={{
        tickSize: 5,
        tickPadding: 4,
        legend: "Valor (R$)",
        legendPosition: "middle",
        legendOffset: -50,
        format: v => `R$ ${v}`
      }}
      axisBottom={{
        tickSize: 5,
        tickPadding: 4
      }}
      labelSkipWidth={16}
      labelSkipHeight={12}
      labelTextColor="#ffffff"
      tooltip={({ id, value }) => (
        <span className="text-xs">{id}: R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
      )}
    />
  );
}

/* =======================================================
   PIZZA / DONUT  : Mensalidades
   ======================================================= */
export function GraficoPizzaMensalidades({ data }) {
  const cores = ["#22c55e", "#ef4444"]; // [Recebido, Pendente]

  return (
    <ResponsivePie
      data={data}
      margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
      innerRadius={0.5}
      padAngle={0.6}
      cornerRadius={3}
      colors={cores}
      activeOuterRadiusOffset={6}
      borderWidth={1}
      borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
      arcLinkLabelsSkipAngle={10}
      arcLinkLabelsTextColor="#333333"
      arcLinkLabelsThickness={2}
      arcLinkLabelsColor={{ from: "color" }}
      arcLabelsSkipAngle={10}
      arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2]] }}
      tooltip={({ datum }) => (
        <span className="text-xs">
          {datum.label}: R$ {datum.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
      )}
    />
  );
}

/* =======================================================
   LINHA : Fluxo de Caixa (Entradas × Saídas)
   Espera um array:
   [
     { id:"Entradas", data:[ {x:"01/05", y:800}, ... ] },
     { id:"Saídas",   data:[ {x:"01/05", y:300}, ... ] }
   ]
   ======================================================= */
export function GraficoFluxoCaixa({ data }) {
  return (
    <ResponsiveLine
      data={data}
      margin={{ top: 20, right: 40, bottom: 50, left: 70 }}
      xScale={{ type: "point" }}
      yScale={{ type: "linear", stacked: false, min: "auto", max: "auto" }}
      axisLeft={{
        legend: "Valor (R$)",
        legendPosition: "middle",
        legendOffset: -50,
        tickPadding: 5,
        tickSize: 5
      }}
      axisBottom={{
        tickSize: 5,
        tickPadding: 5,
        legend: "Data",
        legendOffset: 36,
        legendPosition: "middle"
      }}
      colors={d => (d.id === "Entradas" ? "#22c55e" : "#ef4444")}
      lineWidth={2}
      pointSize={6}
      pointBorderWidth={2}
      pointBorderColor={{ from: "serieColor" }}
      useMesh={true}
      tooltip={({ point }) => (
        <div className="text-xs bg-white p-1 border rounded shadow">
          <strong>{point.serieId}</strong><br />
          {point.data.xFormatted}: R$ {Number(point.data.yFormatted).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
      )}
    />
  );
}
