import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  hint?: string;
  accept?: string;
  maxBytes?: number;
  uploadedPath?: string;
  previewUrl?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => void;
  aspect?: "square" | "wide";
}

const FileDropzone = ({
  label,
  hint,
  accept = "image/*,application/pdf",
  maxBytes = 5 * 1024 * 1024,
  uploadedPath,
  previewUrl,
  onUpload,
  onRemove,
  aspect = "square",
}: Props) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > maxBytes) {
      setErr(`File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(f);
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const isImage = previewUrl && /\.(jpe?g|png|webp|gif)$/i.test(previewUrl);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {uploadedPath && <CheckCircle2 className="h-4 w-4 text-success" />}
      </div>

      {previewUrl && isImage ? (
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          <img
            src={previewUrl}
            alt={label}
            className={cn(
              "w-full object-cover",
              aspect === "wide" ? "aspect-[3/1]" : "aspect-square max-h-48"
            )}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Replace
            </Button>
            {onRemove && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={onRemove}
                disabled={busy}
                className="h-8 w-8"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors p-6 text-center",
            dragOver ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50 hover:bg-muted/30",
            busy && "opacity-60 pointer-events-none"
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : uploadedPath ? (
            <FileText className="h-6 w-6 text-success" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <div className="text-sm">
            {uploadedPath ? (
              <span className="text-success font-medium">File uploaded — click to replace</span>
            ) : (
              <>
                <span className="text-foreground font-medium">Click or drag to upload</span>
                {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
};

export default FileDropzone;
