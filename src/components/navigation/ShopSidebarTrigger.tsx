import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShopSidebar from "./ShopSidebar";

interface ShopSidebarTriggerProps {
  className?: string;
}

const ShopSidebarTrigger = ({ className }: ShopSidebarTriggerProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <ShopSidebar open={open} onOpenChange={setOpen} />
    </>
  );
};

export default ShopSidebarTrigger;
