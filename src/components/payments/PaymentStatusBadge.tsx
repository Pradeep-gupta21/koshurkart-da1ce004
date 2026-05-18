import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, XCircle, ShieldQuestion } from "lucide-react";

export type PaymentStatus =
  | "pending"
  | "pending_verification"
  | "success"
  | "failed"
  | "rejected"
  | "reversed";

const STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    label: "Successful",
    className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    Icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    Icon: Clock,
  },
  pending_verification: {
    label: "Awaiting verification",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    Icon: ShieldQuestion,
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: XCircle,
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: AlertCircle,
  },
  reversed: {
    label: "Reversed",
    className: "bg-muted text-muted-foreground border-border",
    Icon: AlertCircle,
  },
};

export default function PaymentStatusBadge({ status }: { status: string }) {
  const key = (status as PaymentStatus) in STATUS_META ? (status as PaymentStatus) : "pending";
  const { label, className, Icon } = STATUS_META[key];
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}
