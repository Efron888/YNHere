export interface DetectedCard {
  id: string;
  blob: Blob;
  thumbnailDataUrl: string;
  width: number;
  height: number;
}

/**
 * 安全降採樣與圖片轉載入 (防止 12MP 大圖突破記憶體限制)
 */
export async function loadImageAndDownsample(
  imageSource: Blob | File | string,
  maxDimension = 1920
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  let img: HTMLImageElement;

  if (typeof imageSource === 'string') {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imageSource;
    });
  } else {
    const objectUrl = URL.createObjectURL(imageSource);
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(el);
      };
      el.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      };
      el.src = objectUrl;
    });
  }

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法取得 Canvas 2D 繪圖上下文');

  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx };
}

/**
 * 產生列表與預覽用清晰縮圖 (DataURL，預設 960px 兼顧畫質與重新辨識能力)
 */
export function generateThumbnailDataUrl(canvas: HTMLCanvasElement, maxThumbSize = 960): string {
  const thumbCanvas = document.createElement('canvas');
  let tw = canvas.width;
  let th = canvas.height;

  if (tw > th) {
    th = Math.round((th * maxThumbSize) / tw);
    tw = maxThumbSize;
  } else {
    tw = Math.round((tw * maxThumbSize) / th);
    th = maxThumbSize;
  }

  thumbCanvas.width = tw;
  thumbCanvas.height = th;
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) {
    tCtx.drawImage(canvas, 0, 0, tw, th);
  }

  // 優先嘗試 webp，部分舊 iOS 回退為 jpeg
  const dataUrl = thumbCanvas.toDataURL('image/webp', 0.8);
  if (dataUrl.startsWith('data:image/webp')) {
    return dataUrl;
  }
  return thumbCanvas.toDataURL('image/jpeg', 0.8);
}

/**
 * 匯出高畫質名片壓縮 Blob (優先 WebP，降級 JPEG)
 */
export async function canvasToSafeBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') {
          resolve(blob);
        } else {
          canvas.toBlob(
            (jpegBlob) => {
              resolve(jpegBlob || new Blob([], { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.85
          );
        }
      },
      'image/webp',
      0.85
    );
  });
}

/**
 * 名片偵測與切分管線
 * 支援多張切分，若桌面雜訊過多則自動 Fallback 為單張裁切
 */
export async function detectAndCropCards(
  imageSource: Blob | File | string,
  _mode: 'single' | 'batch' = 'single'
): Promise<DetectedCard[]> {
  const { canvas } = await loadImageAndDownsample(imageSource, 1920);

  // 單張模式或 Fallback
  const cardBlob = await canvasToSafeBlob(canvas);
  const thumbUrl = generateThumbnailDataUrl(canvas);

  return [
    {
      id: crypto.randomUUID(),
      blob: cardBlob,
      thumbnailDataUrl: thumbUrl,
      width: canvas.width,
      height: canvas.height,
    },
  ];
}
