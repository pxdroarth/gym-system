import React from "react";
import Chart from "react-apexcharts";

export default function ApexPieChart({ title, data, loading }) {
  // data = [{ label: "Mensalidades", value: 2500 }, ...]
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <Chart
          options={{
            labels: data.map(d => d.label),
            legend: { position: 'bottom' }
          }}
          series={data.map(d => d.value)}
          type="donut"
          height={300}
        />
      )}
    </div>
  );
}
