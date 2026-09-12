import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { DriverSwitch } from "@/components/race/DriverSwitch";
import { useDriverProfile, updateDriverProfile } from "@/lib/telemetry/driverProfiles";
import { updateSettings, useSettings } from "@/lib/telemetry/settings";
import { ACCEPTED_TYPES, thumbnail, uploadDriverPhoto, validateImage } from "@/lib/imagekit";
import type { Driver } from "@/lib/telemetry/drivers";

const SHARE_OPTIONS = [250, 500, 1000, 2000];

/** Intro/setup block: who is driving, their editable profile, and share rate. */
export function DriverSetup({ driver }: { driver: Driver }) {
  const profile = useDriverProfile(driver.id);
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Shown while the upload is in flight so the new photo appears immediately. */
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const reason = validateImage(file);
    if (reason) {
      setStatus({ tone: "error", text: reason });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);
    setStatus(null);
    try {
      const uploaded = await uploadDriverPhoto(file, driver.id);
      await updateDriverProfile(driver.id, {
        photoUrl: uploaded.url,
        photoFileId: uploaded.fileId,
      });
      setStatus({ tone: "ok", text: "Photo uploaded." });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
      setPreview(null);
      URL.revokeObjectURL(localPreview);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="rounded-3xl border border-carbon-foreground/20 bg-carbon-foreground/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="label-xs text-primary">Who is driving</span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-carbon-foreground/30 px-3 py-1 text-xs font-semibold text-carbon-foreground/80"
        >
          {editing ? "Done" : "Edit profile"}
        </button>
      </div>

      <div className="mt-3">
        <DriverSwitch active={driver} tone="dark" />
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="relative shrink-0">
          <img
            src={preview ?? thumbnail(profile.photoUrl, 320)}
            alt={`Portrait of ${profile.name}`}
            width={320}
            height={320}
            loading="lazy"
            className="size-20 rounded-2xl border border-carbon-foreground/20 object-cover"
          />
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-carbon/70">
              <Loader2 className="size-5 animate-spin text-primary" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-carbon-foreground">
            {profile.name}
          </p>
          <p className="text-sm text-carbon-foreground/65">
            Car #{driver.carNumber} · {driver.carName}
          </p>
          <p className="mt-1 text-sm text-carbon-foreground/70">{profile.description}</p>
        </div>
      </div>

      <div className="mt-4">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full border border-carbon-foreground/30 px-4 py-2 text-sm font-semibold text-carbon-foreground/85 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
        {status && (
          <p
            className={`mt-2 text-xs ${status.tone === "ok" ? "text-ok" : "text-primary"}`}
            role="status"
          >
            {status.text}
          </p>
        )}
        <p className="mt-2 text-xs text-carbon-foreground/55">
          JPEG, PNG, WebP or AVIF up to 10 MB. Stored on ImageKit and shared with everyone using
          this console.
        </p>
      </div>

      {editing && (
        <div className="mt-4 space-y-3 border-t border-carbon-foreground/20 pt-4">
          <Field
            label="Driver name"
            value={profile.name}
            onChange={(name) => void updateDriverProfile(driver.id, { name })}
          />
          <Field
            label="Photo link"
            value={profile.photoUrl}
            onChange={(photoUrl) =>
              void updateDriverProfile(driver.id, { photoUrl, photoFileId: null })
            }
          />
          <label className="block">
            <span className="label-xs text-carbon-foreground/70">About this driver</span>
            <textarea
              value={profile.description}
              rows={3}
              onChange={(e) => void updateDriverProfile(driver.id, { description: e.target.value })}
              className="mt-1 w-full rounded-2xl border border-carbon-foreground/25 bg-carbon-foreground/10 px-3 py-2 text-sm text-carbon-foreground outline-none"
            />
          </label>
          <p className="text-xs text-carbon-foreground/55">
            Saved to MongoDB, so the whole team sees the same profile.
          </p>
        </div>
      )}

      <label className="mt-4 block border-t border-carbon-foreground/20 pt-4">
        <span className="label-xs text-carbon-foreground/70">
          How often the live session is shared
        </span>
        <select
          value={settings.shareFrequencyMs}
          onChange={(e) => updateSettings({ shareFrequencyMs: Number(e.target.value) })}
          className="num mt-1 w-full rounded-2xl border border-carbon-foreground/25 bg-carbon-foreground/10 px-3 py-2 text-sm text-carbon-foreground outline-none"
        >
          {SHARE_OPTIONS.map((ms) => (
            <option key={ms} value={ms} className="text-foreground">
              every {ms} ms
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="label-xs text-carbon-foreground/70">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-2xl border border-carbon-foreground/25 bg-carbon-foreground/10 px-3 py-2 text-sm text-carbon-foreground outline-none"
      />
    </label>
  );
}
