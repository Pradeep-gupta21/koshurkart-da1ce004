import { Link } from "react-router-dom";
import { Mountain } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const AuthShell = ({ title, description, children, footer }: AuthShellProps) => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md marketplace-shadow">
        <CardHeader className="text-center">
          <Link to="/" className="mx-auto flex items-center gap-2 mb-2">
            <div className="relative h-11 w-11 rounded-lg bg-[hsl(222_47%_11%)] flex items-center justify-center ring-1 ring-accent/40">
              <span className="text-accent font-serif font-bold text-lg">K</span>
              <Mountain className="absolute -bottom-1 -right-1 h-4 w-4 text-accent bg-background rounded-full p-[1px]" strokeWidth={2.5} />
            </div>
          </Link>
          <CardTitle className="text-2xl font-serif font-bold">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <div className="px-6 pb-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </Card>
    </div>
  );
};

export default AuthShell;
