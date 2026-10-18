import { VideoElementSource, type FrameSource } from "./frameSource";

/** Opens a recorded video (e.g. video evidence) as a looping FrameSource with play/pause/seek. */
export async function openVideo(blob: Blob): Promise<FrameSource> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("This video could not be decoded by the browser."));
  });
  // MediaRecorder WebM files often report duration=Infinity until seeked to the end.
  if (!Number.isFinite(video.duration)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("durationchange", done);
        video.currentTime = 0;
        resolve();
      };
      video.addEventListener("durationchange", done);
      video.currentTime = 1e9;
      setTimeout(done, 1500);
    });
  }
  await video.play().catch(() => {});

  const source = new VideoElementSource(video, "file", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  });
  return Object.assign(source, {
    play: () => video.play(),
    pause: () => video.pause(),
    paused: () => video.paused,
    seek: (t: number) => {
      video.currentTime = Math.max(0, Math.min(t, Number.isFinite(video.duration) ? video.duration : t));
    },
  });
}
