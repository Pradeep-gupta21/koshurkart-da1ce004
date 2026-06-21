import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Upload, X, PackageOpen } from "lucide-react";

export interface ReturnItem {
  id: string;
  title: string;
  orderId: string;
}

interface Props {
  item: ReturnItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (itemId: string) => void;
}

const REASONS = [
  "Damaged or Defective Item",
  "Wrong Product Received",
  "Changed Mind / Disliked",
];

const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ReturnRequestModal = ({ item, open, onOpenChange, onSubmitted }: Props) => {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason("");
    setDescription("");
    setFiles([]);
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected).filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image`);
        return false;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} exceeds 5MB`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  };

  const handleSubmit = async () => {
    if (!item || !user) return;
    if (!reason) {
      toast.error("Please select a return reason");
      return;
    }
    setSubmitting(true);
    try {
      const photoPaths: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${item.orderId}/${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("return-photos").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        photoPaths.push(path);
      }

      const { error } = await supabase
        .from("order_items")
        .update({
          return_status: "requested",
          return_reason: reason,
          return_description: description.trim() || null,
          return_photos: photoPaths,
          return_requested_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) throw error;

      toast.success("Return request submitted", {
        description: "Our team will review your request shortly.",
      });
      onSubmitted?.(item.id);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to submit return request", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-primary" />
            Request a Return
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item?.title ?? "Tell us what went wrong and we'll make it right."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reason for return</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="return-description">Describe the issue (Optional)</Label>
            <Textarea
              id="return-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any details that will help us resolve your request faster..."
              maxLength={1000}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Upload Photo Proof</Label>
            <label
              htmlFor="return-photos"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary/60 rounded-lg p-6 cursor-pointer transition-colors bg-muted/30"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">
                Click to upload (up to {MAX_FILES} images, max 5MB each)
              </span>
              <input
                id="return-photos"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {files.map((f, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-md overflow-hidden border">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReturnRequestModal;
