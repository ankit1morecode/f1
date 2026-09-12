/**
 * Browser-side ImageKit upload.
 *
 * The file goes straight from the browser to ImageKit, so a large photo never
 * passes through this app's server. Authorisation comes from
 * `/api/imagekit/auth`, which signs a short-lived token with the private key —
 * the private key itself never leaves the server.
 */

const UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export interface UploadedImage {
  url: string;
  fileId: string;
  filePath: string;
  name: string;
}

interface AuthPayload {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
  folder: string;
}

/** Human-readable reason the file cannot be uploaded, or null if it is fine. */
export function validateImage(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Use a JPEG, PNG, WebP or AVIF image.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${
      MAX_UPLOAD_BYTES / 1024 / 1024
    } MB.`;
  }
  return null;
}

export async function uploadDriverPhoto(file: File, driverId: string): Promise<UploadedImage> {
  const reason = validateImage(file);
  if (reason) throw new Error(reason);

  const authResponse = await fetch("/api/imagekit/auth");
  if (!authResponse.ok) {
    const detail = (await authResponse.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Could not authorise the upload (${authResponse.status})`);
  }
  const auth = (await authResponse.json()) as AuthPayload;

  const form = new FormData();
  form.append("file", file);
  form.append("fileName", `${driverId}-${Date.now()}`);
  form.append("publicKey", auth.publicKey);
  form.append("token", auth.token);
  form.append("expire", String(auth.expire));
  form.append("signature", auth.signature);
  form.append("folder", auth.folder);
  form.append("useUniqueFileName", "true");

  const uploadResponse = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: form });
  const result = (await uploadResponse.json().catch(() => null)) as
    (UploadedImage & { message?: string }) | null;

  if (!uploadResponse.ok || !result?.url) {
    throw new Error(result?.message ?? `ImageKit rejected the upload (${uploadResponse.status})`);
  }

  return {
    url: result.url,
    fileId: result.fileId,
    filePath: result.filePath,
    name: result.name,
  };
}

/**
 * Adds ImageKit resize transformations to a hosted URL so an avatar box does not
 * download the full-resolution original. Non-ImageKit URLs pass through
 * untouched — profiles may still point at an arbitrary link.
 */
export function thumbnail(url: string, size = 320): string {
  if (!url.includes("ik.imagekit.io")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}tr=w-${size},h-${size},fo-auto`;
}
