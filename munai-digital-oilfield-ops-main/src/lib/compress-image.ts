const IMAGE_TYPES = /^image\//i;
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.82;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Сжимает фото перед загрузкой; PDF и прочие файлы без изменений */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!IMAGE_TYPES.test(file.type) || file.size < 80_000) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    await sleep(0);
    return file;
  }
}

export async function compressFilesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => compressImageForUpload(f)));
}
