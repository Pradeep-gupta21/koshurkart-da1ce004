import { Link } from "react-router-dom";
import { User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

const SidebarHeader = () => {
  const { user, isAdmin, isVendor } = useAuth();
  const displayName = (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "";
  const initial = displayName.charAt(0).toUpperCase() || "G";

  return (
    <div className="bg-primary text-primary-foreground px-5 py-5">
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11 border-2 border-primary-foreground/20">
          <AvatarFallback className="bg-primary-foreground/10 text-primary-foreground font-semibold">
            {user ? initial : <UserIcon className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs opacity-80">{user ? "Hello," : "Welcome"}</p>
          {user ? (
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold truncate text-base">{displayName}</p>
              {isAdmin && (
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20 border-0 text-[10px] px-1.5 py-0 h-4"
                >
                  Admin
                </Badge>
              )}
              {isVendor && !isAdmin && (
                <Badge
                  variant="secondary"
                  className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20 border-0 text-[10px] px-1.5 py-0 h-4"
                >
                  Vendor
                </Badge>
              )}
            </div>
          ) : (
            <Link to="/auth" className="font-semibold underline-offset-2 hover:underline">
              Sign in for the best experience
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default SidebarHeader;
