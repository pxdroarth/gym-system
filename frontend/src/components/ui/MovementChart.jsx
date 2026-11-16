import { lazy, Suspense } from "react";

const MovementChartContent = lazy(() => import("./MovementChartContent"));

export default function MovementChart({ title, data, bars, line, format }) {
  if (!data.length) return <p>Nenhuma movimentação neste recorte.</p>;
  return (
    <div className="gym-chart" role="region" aria-label={title}>
      <Suspense fallback={<p role="status">Carregando gráfico…</p>}>
        <MovementChartContent data={data} bars={bars} line={line} format={format} />
      </Suspense>
    </div>
  );
}
