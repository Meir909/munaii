import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SafeChartContainer } from "@/components/safe-chart-container";

type TrendPoint = { day: string; oil: number; gas: number };
type StatusPoint = { name: string; v: number };

type Props = {
  productionTrend: TrendPoint[];
  wellStatuses: StatusPoint[];
};

export default function DashboardCharts({ productionTrend, wellStatuses }: Props) {
  return (
    <div className="grid lg:grid-cols-3 gap-5 min-w-0">
      <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Добыча за неделю</h3>
            <p className="text-xs text-muted-foreground">Нефть и газ, м³/сутки</p>
          </div>
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </div>
        <SafeChartContainer>
          <LineChart data={productionTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                background: "var(--color-card)",
              }}
            />
            <Line
              type="monotone"
              dataKey="oil"
              stroke="var(--color-primary)"
              strokeWidth={3}
              dot={{ r: 4 }}
              name="Нефть"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="gas"
              stroke="var(--color-info)"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Газ"
              isAnimationActive={false}
            />
          </LineChart>
        </SafeChartContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Статусы скважин</h3>
          <Link to="/app/wells" className="text-xs text-primary hover:underline">
            Все
          </Link>
        </div>
        <SafeChartContainer>
          <BarChart data={wellStatuses}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar
              dataKey="v"
              fill="var(--color-primary)"
              radius={[8, 8, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </SafeChartContainer>
      </div>
    </div>
  );
}
