export default function KpiCard({ title, value, loading }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 min-w-[180px] flex flex-col items-start">
      <span className="text-gray-500 text-sm">{title}</span>
      <span className="text-2xl font-bold mt-2">
        {loading ? "..." : (value !== undefined ? "R$ " + Number(value).toLocaleString("pt-BR") : "-")}
      </span>
    </div>
  );
}
