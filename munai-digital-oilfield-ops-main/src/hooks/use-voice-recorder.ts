import { useCallback, useRef, useState } from "react";

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Микрофон не поддерживается в этом браузере");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRef.current;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("Запись не была начата"));
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          recorder.stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          setRecording(false);
          if (blob.size < 100) {
            reject(new Error("Слишком короткая запись. Говорите громче и дольше."));
            return;
          }
          resolve(blob);
        },
        { once: true },
      );
      recorder.stop();
    });
  }, []);

  return { recording, processing, setProcessing, start, stop };
}
