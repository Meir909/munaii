import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

type Props = {
  children: ReactElement;
  className?: string;
};

/**
 * Recharts ResponsiveContainer can loop resize observers inside flex/grid
 * and freeze the main thread. minWidth={0} + debounce prevents that.
 */
export function SafeChartContainer({ children, className = "h-64 min-w-0 w-full" }: Props) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={80}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
