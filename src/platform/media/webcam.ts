import { VideoElementSource, type FrameSource } from "./frameSource";

export type CameraErrorReason = "denied" | "not-found" | "other";

export class CameraError extends Error {
  constructor(
    readonly reason: CameraErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CameraError";
  }
}

const CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
  audio: false,
};

function toCameraError(e: unknown): CameraError {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return new CameraError("denied", "Camera permission was denied.");
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return new CameraError("not-found", "No camera was found.");
  }
  return new CameraError("other", `The camera could not start${(e as Error)?.message ? `: ${(e as Error).message}` : "."}`);
}

async function getStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("not-found", "This browser has no camera access.");
  try {
    return await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  } catch (e) {
    throw toCameraError(e);
  }
}

/**
 * Opens the webcam as a FrameSource. If the camera disconnects, the source
 * reports "lost" (the element keeps its last frame) and retries every 2 s.
 */
export async function openWebcam(): Promise<FrameSource> {
  let stream = await getStream();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  let retryTimer = 0;
  let disposed = false;
  const stopStream = () => stream.getTracks().forEach((t) => t.stop());
  const source = new VideoElementSource(video, "live", () => {
    disposed = true;
    clearTimeout(retryTimer);
    stopStream();
  });

  const watch = () => {
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", onLost, { once: true });
    }
  };
  const onLost = () => {
    if (disposed) return;
    source.setStatus("lost");
    const retry = async () => {
      if (disposed) return;
      try {
        stream = await getStream();
        video.srcObject = stream;
        await video.play();
        watch();
        source.setStatus("ok");
      } catch {
        retryTimer = window.setTimeout(retry, 2000);
      }
    };
    retryTimer = window.setTimeout(retry, 2000);
  };
  watch();
  return source;
}
