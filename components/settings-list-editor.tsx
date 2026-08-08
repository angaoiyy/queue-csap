"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createSettingsItem,
  updateSettingsItem,
  setSettingsItemActive,
  reorderSettingsItems,
  listSettingsItems,
  type SettingsItem,
  type SettingsItemInput,
  type SettingsTable,
} from "@/lib/actions/settings";

type ExtraFieldDef =
  | { key: "prefix"; label: string; type: "text" }
  | { key: "requires_degree_program" | "requires_purpose"; label: string; type: "checkbox" };

type Props = {
  table: SettingsTable;
  title: string;
  description: string;
  initialItems: SettingsItem[];
  extraFields?: ExtraFieldDef[];
};

const EMPTY_FORM: SettingsItemInput = {
  label: "",
  prefix: "",
  requires_degree_program: false,
  requires_purpose: false,
};

export function SettingsListEditor({
  table,
  title,
  description,
  initialItems,
  extraFields = [],
}: Props) {
  const [items, setItems] = useState<SettingsItem[]>(initialItems);
  const [newForm, setNewForm] = useState<SettingsItemInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SettingsItemInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  const handleAdd = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const result = await createSettingsItem(table, newForm);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNewForm(EMPTY_FORM);
      setItems(await listSettingsItems(table));
    } finally {
      setIsBusy(false);
    }
  };

  const startEdit = (item: SettingsItem) => {
    setEditingId(item.id);
    setEditForm({
      label: item.label,
      prefix: item.prefix ?? "",
      requires_degree_program: item.requires_degree_program ?? false,
      requires_purpose: item.requires_purpose ?? false,
    });
  };

  const handleSaveEdit = async (id: string) => {
    setError(null);
    setIsBusy(true);
    try {
      const result = await updateSettingsItem(table, id, editForm);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...editForm, label: editForm.label } : item))
      );
      setEditingId(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleActive = async (item: SettingsItem) => {
    setError(null);
    setIsBusy(true);
    try {
      const result = await setSettingsItemActive(table, item.id, !item.is_active);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: !item.is_active } : i))
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    const index = sorted.findIndex((item) => item.id === id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    const orderedIds = reordered.map((item) => item.id);

    setError(null);
    setIsBusy(true);
    try {
      const result = await reorderSettingsItems(table, orderedIds);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          sort_order: orderedIds.indexOf(item.id),
        }))
      );
    } finally {
      setIsBusy(false);
    }
  };

  const renderExtraFieldInputs = (
    form: SettingsItemInput,
    setForm: (updater: (prev: SettingsItemInput) => SettingsItemInput) => void
  ) =>
    extraFields.map((field) => {
      if (field.type === "text") {
        return (
          <Input
            key={field.key}
            placeholder={field.label}
            value={form[field.key] as string}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
          />
        );
      }
      return (
        <div key={field.key} className="flex items-center gap-2">
          <Checkbox
            id={`${table}-${field.key}`}
            checked={Boolean(form[field.key])}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, [field.key]: checked === true }))
            }
          />
          <Label htmlFor={`${table}-${field.key}`} className="font-normal">
            {field.label}
          </Label>
        </div>
      );
    });

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        )}
        {sorted.map((item, index) => (
          <div key={item.id} className="rounded-md border p-3">
            {editingId === item.id ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={editForm.label}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, label: e.target.value }))
                  }
                />
                {renderExtraFieldInputs(editForm, setEditForm)}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleSaveEdit(item.id)}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.label}</span>
                    {item.prefix && (
                      <Badge variant="secondary">{item.prefix}</Badge>
                    )}
                    <Badge variant={item.is_active ? "default" : "outline"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {(item.requires_degree_program || item.requires_purpose) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.requires_degree_program &&
                        "Requires degree program selection"}
                      {item.requires_purpose && "Requires purpose of request"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy || index === 0}
                    onClick={() => handleMove(item.id, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy || index === sorted.length - 1}
                    onClick={() => handleMove(item.id, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => handleToggleActive(item)}
                  >
                    {item.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Input
          placeholder="New item label"
          value={newForm.label}
          onChange={(e) => setNewForm((prev) => ({ ...prev, label: e.target.value }))}
          className="max-w-xs"
        />
        {renderExtraFieldInputs(newForm, setNewForm)}
        <Button type="button" disabled={isBusy || !newForm.label.trim()} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
