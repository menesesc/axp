"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

interface DocumentsTrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

interface DocumentsTrendCardProps {
  data: DocumentsTrendPoint[];
  isLoading?: boolean;
}

export function DocumentsTrendCard({ data, isLoading }: DocumentsTrendCardProps) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Documentos últimos 30 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse h-32 w-full rounded-md bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.some((d) => d.count > 0);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Documentos últimos 30 días
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => {
                    // Mostrar como DD/MM
                    const [, month, day] = value.split("-");
                    return `${day}/${month}`;
                  }}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [(value as number).toLocaleString("es-AR"), "Documentos"]}
                  labelFormatter={(label) => {
                    const [year, month, day] = String(label).split("-");
                    return `${day}/${month}/${year}`;
                  }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
