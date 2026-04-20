import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
}

const OnboardingFieldGroup = ({ title, description, icon: Icon, children }: Props) => {
  return (
    <section className="rounded-xl bg-card border shadow-sm p-5 sm:p-6 space-y-5">
      <header className="flex items-start gap-3">
        {Icon && (
          <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
};

export default OnboardingFieldGroup;
