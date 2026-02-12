"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

interface ProviderTotal {
  proveedorId: string;
  proveedor: string;
  total: number;
  count: number;
}

interface ProviderTotalsChartProps {
  data: ProviderTotal[];
  isLoading?: boolean;
}

const COLORS = [
  '#0f172a', '#334155', '#475569', '#64748b', '#94a3b8',
  '#a3a3a3', '#737373', '#525252', '#404040', '#262626'
];

export function ProviderTotalsChart({ data, isLoading }: ProviderTotalsChartProps) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">
            Proveedores (7 días)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse h-32 w-full rounded-md bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.length > 0;

  const formatAmount = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Truncar nombres largos de proveedores
  const truncateName = (name: string, maxLength: number = 12) => {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength - 1) + '…';
  };

  // Preparar datos para el gráfico
  const chartData = data.slice(0, 8).map((item) => ({
    ...item,
    shortName: truncateName(item.proveedor),
  }));

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium">
          Top proveedores (7 días)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {!hasData ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAmount}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [
                    `$${(value as number).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
                    "Total"
                  ]}
                  labelFormatter={(_, payload) => {
                    if (payload && payload[0]) {
                      const item = payload[0].payload as ProviderTotal & { shortName: string };
                      return `${item.proveedor} (${item.count} docs)`;
                    }
                    return '';
                  }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length] ?? '#0f172a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
