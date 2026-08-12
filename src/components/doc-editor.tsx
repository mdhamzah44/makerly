import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Json, JsonDoc } from "@/lib/collections";

const LONG_TEXT = /description|body|policy|note|content|summary|instructions|blurb|keywords/i;

function isImageUrl(v: unknown) {
  return typeof v === "string" && /^https?:\/\/.+\.(jpe?g|png|webp|gif|avif)/i.test(v);
}

export type DocEditorProps = {
  value: JsonDoc;
  onChange: (next: JsonDoc) => void;
  hiddenFields?: string[];
};

/**
 * Auto-generates an editor for any Mongo document: scalars get typed inputs,
 * nested objects/arrays get a validated JSON editor, and new keys can be added.
 */
export function DocEditor({ value, onChange, hiddenFields = [] }: DocEditorProps) {
  const [newKey, setNewKey] = useState("");
  const keys = useMemo(
    () =>
      Object.keys(value)
        .filter((k) => k !== "_id" && !hiddenFields.includes(k))
        .sort((a, b) => a.localeCompare(b)),
    [value, hiddenFields],
  );

  const set = (key: string, next: Json) => onChange({ ...value, [key]: next });
  const remove = (key: string) => {
    const clone = { ...value };
    delete clone[key];
    onChange(clone);
  };

  return (
    <div className="space-y-4">
      {value["_id"] !== undefined && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          _id: {String(value["_id"])}
        </div>
      )}

      {keys.map((key) => (
        <FieldRow
          key={key}
          name={key}
          value={value[key] as Json}
          onChange={(v) => set(key, v)}
          onRemove={() => remove(key)}
        />
      ))}

      <div className="flex items-end gap-2 border-t border-border pt-4">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Add a new field</Label>
          <Input
            value={newKey}
            placeholder="field_name"
            onChange={(e) => setNewKey(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const k = newKey.trim();
            if (!k) return;
            set(k, "");
            setNewKey("");
          }}
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  name,
  value,
  onChange,
  onRemove,
}: {
  name: string;
  value: Json;
  onChange: (v: Json) => void;
  onRemove: () => void;
}) {
  const [raw, setRaw] = useState(() =>
    value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : "",
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const label = (
    <div className="flex items-center justify-between gap-2">
      <Label className="font-mono text-xs text-muted-foreground">{name}</Label>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );

  if (typeof value === "boolean") {
    return (
      <div className="space-y-1.5">
        {label}
        <div className="flex h-9 items-center">
          <Switch checked={value} onCheckedChange={(c) => onChange(c)} />
        </div>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="space-y-1.5">
        {label}
        <Input
          type="number"
          value={String(value)}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </div>
    );
  }

  if (value !== null && typeof value === "object") {
    return (
      <div className="space-y-1.5">
        {label}
        <Textarea
          value={raw}
          rows={Math.min(16, raw.split("\n").length + 1)}
          spellCheck={false}
          className="font-mono text-xs"
          onChange={(e) => {
            setRaw(e.target.value);
            try {
              onChange(JSON.parse(e.target.value) as Json);
              setJsonError(null);
            } catch {
              setJsonError("Invalid JSON — changes to this field are not saved yet.");
            }
          }}
        />
        {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
      </div>
    );
  }

  const str = value === null ? "" : String(value);
  return (
    <div className="space-y-1.5">
      {label}
      {LONG_TEXT.test(name) || str.length > 90 ? (
        <Textarea value={str} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={str} onChange={(e) => onChange(e.target.value)} />
      )}
      {isImageUrl(str) && (
        <img
          src={str}
          alt={name}
          className="mt-1 h-20 w-20 rounded-md border border-border object-cover"
        />
      )}
    </div>
  );
}