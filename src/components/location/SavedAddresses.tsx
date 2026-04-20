import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Star, Trash2, Pencil, Check, X, Plus, Home, Briefcase } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { locationService } from "@/services/locationService";
import LocationDialog from "@/components/location/LocationDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUICK_LABELS = [
  { value: "Home", icon: Home },
  { value: "Office", icon: Briefcase },
  { value: "Other", icon: MapPin },
];

const SavedAddresses = () => {
  const { savedLocations, refreshSaved } = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    try {
      await locationService.setDefault(id);
      await refreshSaved();
      toast.success("Default address updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to set default");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setBusyId(deleteId);
    try {
      await locationService.deleteUserLocation(deleteId);
      await refreshSaved();
      toast.success("Address removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally {
      setBusyId(null);
      setDeleteId(null);
    }
  };

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };

  const saveLabel = async (id: string, label?: string) => {
    const next = (label ?? editValue).trim();
    if (!next) {
      toast.error("Label cannot be empty");
      return;
    }
    setBusyId(id);
    try {
      await locationService.updateUserLocation(id, { label: next });
      await refreshSaved();
      setEditingId(null);
      toast.success("Label updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update label");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="marketplace-shadow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" /> Saved Addresses
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {savedLocations.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No saved addresses yet</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add your first address
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {savedLocations.map((loc) => {
              const isEditing = editingId === loc.id;
              const isBusy = busyId === loc.id;
              return (
                <div
                  key={loc.id}
                  className={cn(
                    "border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors",
                    loc.is_default && "border-primary/40 bg-primary/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {QUICK_LABELS.map((q) => {
                            const Icon = q.icon;
                            return (
                              <Button
                                key={q.value}
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => saveLabel(loc.id, q.value)}
                                disabled={isBusy}
                              >
                                <Icon className="h-3 w-3 mr-1" /> {q.value}
                              </Button>
                            );
                          })}
                        </div>
                        <div className="flex gap-1.5">
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value.slice(0, 40))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveLabel(loc.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-8 text-sm"
                            placeholder="Custom label"
                          />
                          <Button size="sm" className="h-8 px-2" onClick={() => saveLabel(loc.id)} disabled={isBusy}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{loc.label}</p>
                          {loc.is_default && (
                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">
                              <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> Default
                            </Badge>
                          )}
                          <button
                            onClick={() => startEdit(loc.id, loc.label)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit label"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {loc.city} — {loc.pincode}
                          {loc.state && `, ${loc.state}`}
                        </p>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-2 sm:flex-shrink-0">
                      {!loc.is_default && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(loc.id)}
                          disabled={isBusy}
                        >
                          <Star className="h-3.5 w-3.5 mr-1" /> Set default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(loc.id)}
                        disabled={isBusy}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <LocationDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              This action can't be undone. You can re-add the address later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default SavedAddresses;
