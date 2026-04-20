import { Link } from "react-router-dom";
import { User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";

const SidebarHeader = () => {
  const { user } = useAuth();
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
        <div className="min-w-0">
          <p className="text-xs opacity-80">{user ? "Hello," : "Welcome"}</p>
          {user ? (
            <p className="font-semibold truncate text-base">{displayName}</p>
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
