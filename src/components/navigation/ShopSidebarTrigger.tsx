import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/SidebarContext";

interface ShopSidebarTriggerProps {
  className?: string;
}

const ShopSidebarTrigger = ({ className }: ShopSidebarTriggerProps) => {
  const { open } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={open}
      aria-label="Open main navigation"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
};

export default ShopSidebarTrigger;
