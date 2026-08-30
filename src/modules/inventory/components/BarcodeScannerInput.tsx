import { useEffect, useRef, useState } from "react";
import { ScanBarcode, Search } from "lucide-react";

interface BarcodeScannerInputProps {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Los lectores de código de barras USB/Bluetooth se comportan ante el
 * sistema operativo como un teclado: "escriben" cada carácter y rematan con
 * Enter. La diferencia con una persona tecleando es la velocidad: un lector
 * entrega el código completo en unos pocos milisegundos. Este componente
 * mide el intervalo entre pulsaciones; si es menor al umbral, interpreta la
 * entrada como escaneo automático y dispara `onScan` sin que el usuario
 * tenga que presionar nada. Si el intervalo es mayor (tecleo humano), se
 * comporta como un buscador normal y solo dispara al presionar Enter.
 */
const SCANNER_MAX_INTERVAL_MS = 40;

export function BarcodeScannerInput({
  onScan,
  placeholder = "Escanea o escribe un código / nombre...",
  autoFocus = true,
}: BarcodeScannerInputProps) {
  const [value, setValue] = useState("");
  const lastKeyTime = useRef<number>(0);
  const bufferIsFromScanner = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    const interval = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (e.key !== "Enter") {
      // Si las pulsaciones llegan muy rápido, marcamos el buffer como
      // proveniente de un escáner (aunque el usuario también podría estar
      // pegando texto, que se comporta igual y es igualmente válido aquí).
      if (interval < SCANNER_MAX_INTERVAL_MS) {
        bufferIsFromScanner.current = true;
      }
      return;
    }

    // Enter: todo lector remata el código con Enter. Un humano buscando
    // también puede presionar Enter para confirmar, así que en ambos casos
    // disparamos la búsqueda — la distinción de "scanner" solo sirve para
    // limpiar el campo automáticamente después.
    e.preventDefault();
    const code = value.trim();
    if (!code) return;
    onScan(code);
    if (bufferIsFromScanner.current) {
      setValue("");
    }
    bufferIsFromScanner.current = false;
  };

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-11 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
      />
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
    </div>
  );
}
