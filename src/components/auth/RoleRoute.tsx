import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoleRouteProps {
  children: React.ReactNode;
  requiredRole: "vendor" | "admin";
}

const RoleRoute = ({ children, requiredRole }: RoleRouteProps) => {
  const { user, loading, roles } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!roles.includes(requiredRole)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to access this page. This area requires the <strong>{requiredRole}</strong> role.
        </p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleRoute;
