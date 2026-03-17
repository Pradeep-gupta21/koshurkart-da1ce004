import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const ranges: { value: TimeRange; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const TimeRangeSelector = ({ value, onChange }: TimeRangeSelectorProps) => (
  <Tabs value={value} onValueChange={(v) => onChange(v as TimeRange)}>
    <TabsList>
      {ranges.map(r => (
        <TabsTrigger key={r.value} value={r.value}>{r.label}</TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
