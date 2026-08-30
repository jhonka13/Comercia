import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import type { ProductImage } from "@/shared/types/catalog";
import { getProductImageUrl } from "@/modules/inventory/api/catalogApi";

interface ProductImageUploaderProps {
  images: ProductImage[];
  onUpload: (file: File, isPrimary: boolean) => Promise<void>;
  onDelete: (image: ProductImage) => Promise<void>;
  uploading?: boolean;
}

const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProductImageUploader({
  images,
  onUpload,
  onDelete,
  uploading,
}: ProductImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato no soportado. Usa JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`La imagen supera ${MAX_SIZE_MB}MB.`);
      return;
    }
    await onUpload(file, images.length === 0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div
            key={img.id}
            className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
          >
            <img
              src={getProductImageUrl(img.storage_path)}
              alt=""
              className="h-full w-full object-cover"
            />
            {img.is_primary && (
              <span className="absolute left-1 top-1 rounded-full bg-emerald-400 p-1">
                <Star className="h-3 w-3 text-black" fill="black" />
              </span>
            )}
            <button
              type="button"
              onClick={() => onDelete(img)}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"
              aria-label="Eliminar imagen"
            >
              <Trash2 className="h-5 w-5 text-white" />
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-50"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[11px]">{uploading ? "Subiendo..." : "Agregar"}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
    </div>
  );
}
