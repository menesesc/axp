"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Hash, DollarSign } from "lucide-react";

interface DocumentsTrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
  amount: number;
}

interface DocumentsTrendCardProps {
  data: DocumentsTrendPoint[];
  isLoading?: boolean;
}

export function DocumentsTrendCard({ data, isLoading }: DocumentsTrendCardProps) {
  const [viewMode, setViewMode] = useState<'count' | 'amount'>('count');

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">
            Últimos 30 días
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[160px] flex items-center justify-center">
            <div className="animate-pulse h-24 w-full rounded-md bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.some((d) => viewMode === 'count' ? d.count > 0 : d.amount > 0);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Últimos 30 días
          </CardTitle>
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-2 text-xs ${viewMode === 'count' ? 'bg-white shadow-sm' : ''}`}
              onClick={() => setViewMode('count')}
            >
              <Hash className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-2 text-xs ${viewMode === 'amount' ? 'bg-white shadow-sm' : ''}`}
              onClick={() => setViewMode('amount')}
            >
              <DollarSign className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {!hasData ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => [
                    viewMode === 'count'
                      ? (value as number).toLocaleString("es-AR")
                      : `$${(value as number).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
                    viewMode === 'count' ? "Documentos" : "Importe"
                  ]}
                  labelFormatter={(label) => {
                    const [year, month, day] = String(label).split("-");
                    return `${day}/${month}/${year}`;
                  }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={viewMode}
                  stroke="#0f172a"
                  strokeWidth={2}
                  fill="url(#colorGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
