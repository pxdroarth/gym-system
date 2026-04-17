import React from "react";
import Chart from "react-apexcharts";

export default function ApexLineChart({ title, data, loading }) {
  // data = [{ name: 'Entradas', data: [100, 150, ...] }, { name: 'Saídas', data: [50, 60, ...] }]
  // Use labels ou categories conforme a query backend
  const categories = data[0]?.categories || [];

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <Chart
          options={{
            chart: { type: "line" },
            xaxis: { categories },
            dataLabels: { enabled: false }
          }}
          series={data}
          type="line"
          height={300}
        />
      )}
    </div>
  );
}
