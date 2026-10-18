/** SHA-256 of the bytes as lowercase hex. Used as the blob's content address. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Downscaled JPEG thumbnail of an image blob (browser only). */
export async function makeThumbnail(blob: Blob, maxSide = 256): Promise<Uint8Array> {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new Uint8Array(await out.arrayBuffer());
}

/** Thumbnail of the first frame of a video blob (browser only). */
export async function makeVideoThumbnail(blob: Blob, maxSide = 256): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("could not decode video"));
    });
    const s = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * s));
    const h = Math.max(1, Math.round(video.videoHeight * s));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
