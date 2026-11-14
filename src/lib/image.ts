// Сжатие изображений на устройстве перед загрузкой — экономит трафик на мобильном.

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fallback ниже */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать изображение. Попробуйте JPEG или PNG."));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Уменьшает картинку до maxSide по большей стороне и кодирует в JPEG.
 * square=true — обрезка по центру до квадрата (для аватара).
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82, square = false): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Можно загрузить только изображение");
  if (file.size > 25 * 1024 * 1024) throw new Error("Файл слишком большой (максимум 25 МБ)");
  const src = await loadBitmap(file);
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;

  let sx = 0, sy = 0, sw = w, sh = h;
  if (square) {
    const s = Math.min(w, h);
    sx = (w - s) / 2;
    sy = (h - s) / 2;
    sw = sh = s;
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const tw = Math.round(sw * scale);
  const th = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось обработать изображение"))), "image/jpeg", quality),
  );
}
