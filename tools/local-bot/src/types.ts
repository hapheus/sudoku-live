// Shape of logical hints consumed by the local planner and wire adapter.
export interface LogicalHint {
  index: number;
  digit: number;
  technique: string;
  unitType: string | null;
  unitIndex: number | null;
  contextDelays: Map<number, number>;
}
