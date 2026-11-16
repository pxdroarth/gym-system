import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const colors = { entries: "#19a46a", expenses: "#dc4857", balance: "#075dff", allowed: "#19a46a", denied: "#dc4857", sales: "#075dff" };

export default function MovementChartContent({ data, bars, line, format = (value) => value }) {
  const Chart = line ? ComposedChart : BarChart;
  return <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <Chart data={data}>
        <CartesianGrid stroke="#e5ebf4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} width={68} tickFormatter={format} />
        <Tooltip formatter={format} labelFormatter={(label, items) => items?.[0]?.payload.fullLabel || label} />
        <Legend />
        {bars.map(({ key, label }) => <Bar key={key} name={label} dataKey={key} fill={colors[key]} maxBarSize={32} isAnimationActive={false} />)}
        {line && <Line name={line.label} dataKey={line.key} stroke={colors[line.key]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />}
      </Chart>
    </ResponsiveContainer>;
}
