import { useState, useRef, KeyboardEvent, ClipboardEvent, FormEvent } from "react";
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/shared/lib/supabaseClient";
import { fetchUserContext, redirectByRole } from "@/shared/lib/authContext";

// ============================================================
// Tipos
// ============================================================

type AuthView = "login" | "register" | "forgot" | "verify";

// ============================================================
// Primitivas de UI reutilizadas en las 4 vistas
// ============================================================

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-purple-700 via-indigo-900 to-teal-800 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl p-8">
        {children}
      </div>
    </div>
  );
}

function AuthIcon({ icon: Icon }: { icon: typeof Lock }) {
  return (
    <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
      <Icon className="h-6 w-6 text-white" strokeWidth={2} />
    </div>
  );
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center mb-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-sm text-white/60">{subtitle}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold tracking-wider uppercase text-white/50 mb-2">
      {children}
    </label>
  );
}

function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-white/10 bg-purple-950/40 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 " +
        (props.className ?? "")
      }
    />
  );
}

function PrimaryButton({
  children,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-400 py-3 font-bold uppercase tracking-wide text-black transition hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? "Procesando..." : children}
      {!loading && <ArrowRight className="h-4 w-4" strokeWidth={3} />}
    </button>
  );
}

function EncryptedFooter() {
  return (
    <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-white/25">
      Conexión cifrada: verificada
    </p>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 flex w-full items-center justify-center gap-1 text-sm text-white/60 hover:text-white transition"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-3 text-sm text-rose-300 text-center">{message}</p>;
}

// ============================================================
// Input de código de 4 dígitos (casillas separadas, auto-avance)
// ============================================================

function OtpInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (index: number, digit: string) => {
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < 3) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", ""];
    pasted.split("").forEach((d, i) => (next[i] = d));
    onChange(next);
    refs.current[Math.min(pasted.length, 3)]?.focus();
  };

  return (
    <div className="flex justify-center gap-3" onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          inputMode="numeric"
          maxLength={1}
          className="h-16 w-14 rounded-xl border border-emerald-400/60 bg-purple-950/40 text-center text-3xl font-bold text-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
        />
      ))}
    </div>
  );
}

// ============================================================
// Modal de éxito
// ============================================================

function SuccessModal({ onGoToPanel }: { onGoToPanel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" strokeWidth={2} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">¡Verificado!</h2>
        <p className="mt-2 text-sm text-slate-500">Cuenta verificada correctamente</p>
        <button
          onClick={onGoToPanel}
          className="mt-6 w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500"
        >
          Ir al Panel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Vista: Login
// ============================================================

function LoginView({
  onNavigate,
  onSubmit,
  loading,
  error,
}: {
  onNavigate: (v: AuthView) => void;
  onSubmit: (email: string, password: string, remember: boolean) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(email, password, remember);
  };

  return (
    <form onSubmit={handleSubmit}>
      <AuthIcon icon={Lock} />
      <AuthHeader title="Bienvenido" subtitle="Ingresa a tu panel de gestión" />

      <div className="space-y-4">
        <div>
          <FieldLabel>Correo</FieldLabel>
          <TextField
            type="email"
            required
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Contraseña</FieldLabel>
          <div className="relative">
            <TextField
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              className="pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-white/60">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-purple-950/40 accent-emerald-400"
            />
            Recordar sesión
          </label>
          <button
            type="button"
            onClick={() => onNavigate("forgot")}
            className="text-emerald-300 hover:text-emerald-200"
          >
            ¿Olvidaste la contraseña?
          </button>
        </div>

        <PrimaryButton type="submit" loading={loading}>
          Iniciar Sesión
        </PrimaryButton>

        <ErrorText message={error} />

        <p className="text-center text-sm text-white/50">
          ¿No tienes cuenta?{" "}
          <button
            type="button"
            onClick={() => onNavigate("register")}
            className="font-semibold text-emerald-300 hover:text-emerald-200"
          >
            Regístrate aquí
          </button>
        </p>
      </div>

      <EncryptedFooter />
    </form>
  );
}

// ============================================================
// Vista: Registro
// ============================================================

function RegisterView({
  onNavigate,
  onSubmit,
  loading,
  error,
}: {
  onNavigate: (v: AuthView) => void;
  onSubmit: (name: string, businessName: string, email: string, password: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(name, businessName, email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <AuthIcon icon={Lock} />
      <AuthHeader title="Crea tu cuenta" subtitle="Sin tarjeta, cancela cuando quieras" />

      <div className="space-y-4">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <TextField
            required
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Nombre del supermercado</FieldLabel>
          <TextField
            required
            placeholder="Ej. Supermercado La Familia"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Correo</FieldLabel>
          <TextField
            type="email"
            required
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Contraseña</FieldLabel>
          <TextField
            type="password"
            required
            minLength={8}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <PrimaryButton type="submit" loading={loading}>
          Crear Cuenta
        </PrimaryButton>

        <ErrorText message={error} />

        <p className="text-center text-sm text-white/50">
          ¿Ya tienes cuenta?{" "}
          <button
            type="button"
            onClick={() => onNavigate("login")}
            className="font-semibold text-emerald-300 hover:text-emerald-200"
          >
            Ingresa
          </button>
        </p>
      </div>

      <EncryptedFooter />
    </form>
  );
}

// ============================================================
// Vista: Recuperar contraseña
// ============================================================

function ForgotPasswordView({
  onNavigate,
  onSubmit,
  loading,
  error,
}: {
  onNavigate: (v: AuthView) => void;
  onSubmit: (email: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(email);
  };

  return (
    <form onSubmit={handleSubmit}>
      <AuthIcon icon={Lock} />
      <AuthHeader title="Recuperar contraseña" subtitle="Ingresa tu correo y te mandamos un código" />

      <div className="space-y-4">
        <div>
          <FieldLabel>Correo</FieldLabel>
          <TextField
            type="email"
            required
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <PrimaryButton type="submit" loading={loading}>
          Enviar Código
        </PrimaryButton>

        <ErrorText message={error} />
      </div>

      <BackLink label="Volver al login" onClick={() => onNavigate("login")} />
      <EncryptedFooter />
    </form>
  );
}

// ============================================================
// Vista: Verificación de código
// ============================================================

function VerifyView({
  onNavigate,
  onSubmit,
  loading,
  error,
}: {
  onNavigate: (v: AuthView) => void;
  onSubmit: (code: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [digits, setDigits] = useState(["", "", "", ""]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(digits.join(""));
  };

  const complete = digits.every((d) => d !== "");

  return (
    <form onSubmit={handleSubmit}>
      <AuthIcon icon={ShieldCheck} />
      <AuthHeader title="Verificación" subtitle="Ingresa el código enviado a tu WhatsApp" />

      <div className="space-y-6">
        <div>
          <p className="mb-3 text-center text-[11px] font-semibold tracking-wider uppercase text-white/50">
            Código de 4 dígitos
          </p>
          <OtpInput value={digits} onChange={setDigits} />
        </div>

        <PrimaryButton type="submit" loading={loading} disabled={!complete}>
          Activar Cuenta
        </PrimaryButton>

        <ErrorText message={error} />
      </div>

      <BackLink label="Volver al registro" onClick={() => onNavigate("register")} />
      <EncryptedFooter />
    </form>
  );
}

// ============================================================
// Componente principal
// ============================================================

export default function AuthLayout() {
  const [view, setView] = useState<AuthView>("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingFullName, setPendingFullName] = useState("");
  const [pendingBusinessName, setPendingBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const navigate = (next: AuthView) => {
    setError(null);
    setView(next);
  };

  // --- Login ---
  const handleLogin = async (email: string, password: string, _remember: boolean) => {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setLoading(false);
      setError("Correo o contraseña incorrectos.");
      return;
    }
    // _remember: controla si la sesión persiste solo en memoria o en localStorage;
    // se resuelve en la config de createClient (persistSession) si se necesita
    // distinguir por usuario.
    const context = await fetchUserContext();
    setLoading(false);
    if (!context) {
      setError("No se encontró un tenant asociado a esta cuenta. Contacta soporte.");
      return;
    }
    redirectByRole(context);
  };

  // --- Registro ---
  const handleRegister = async (
    name: string,
    businessName: string,
    email: string,
    password: string
  ) => {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setPendingEmail(email);
    setPendingFullName(name);
    setPendingBusinessName(businessName);
    navigate("verify");
  };

  // --- Recuperar contraseña ---
  const handleForgotPassword = async (email: string) => {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setPendingEmail(email);
    navigate("verify");
  };

  // --- Verificación de código ---
  const handleVerify = async (code: string) => {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: "email",
    });
    if (authError) {
      setLoading(false);
      setError("Código inválido o vencido.");
      return;
    }

    if (pendingBusinessName) {
      const { error: rpcError } = await supabase.rpc("create_tenant_and_owner", {
        p_business_name: pendingBusinessName,
        p_full_name: pendingFullName,
      });
      if (rpcError) {
        setLoading(false);
        setError("No se pudo crear tu cuenta de negocio: " + rpcError.message);
        return;
      }
    }

    setLoading(false);
    setShowSuccess(true);
  };

  return (
    <AuthCard>
      {view === "login" && (
        <LoginView onNavigate={navigate} onSubmit={handleLogin} loading={loading} error={error} />
      )}
      {view === "register" && (
        <RegisterView
          onNavigate={navigate}
          onSubmit={handleRegister}
          loading={loading}
          error={error}
        />
      )}
      {view === "forgot" && (
        <ForgotPasswordView
          onNavigate={navigate}
          onSubmit={handleForgotPassword}
          loading={loading}
          error={error}
        />
      )}
      {view === "verify" && (
        <VerifyView onNavigate={navigate} onSubmit={handleVerify} loading={loading} error={error} />
      )}

      {showSuccess && (
        <SuccessModal onGoToPanel={() => (window.location.href = "/panel")} />
      )}
    </AuthCard>
  );
}