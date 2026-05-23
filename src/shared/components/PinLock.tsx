import { useState } from "react";

interface PinLockProps {
  children: React.ReactNode;
  correctPin: string;
  title: string;
}

export function PinLock({ children, correctPin, title }: PinLockProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  // IMPORTANTE: Agora ele verifica se já estava desbloqueado no sessionStorage
  const [unlocked, setUnlocked] = useState(() => {
    return sessionStorage.getItem(`pin-unlocked-${title}`) === "true";
  });

  const handleUnlock = () => {
    if (pin === correctPin) {
      setUnlocked(true);
      // Salva no navegador que esta tela foi desbloqueada para resistir ao F5
      sessionStorage.setItem(`pin-unlocked-${title}`, "true");
    } else {
      setError(true);
      setTimeout(() => {
        setError(false);
        setPin("");
      }, 500);
    }
  };

  // Permite apertar a tecla "Enter" para entrar sem precisar clicar no botão
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleUnlock();
    }
  };

  // Se estiver destravado, mostra o sistema (Caixa ou Garçom)
  if (unlocked) {
    return <>{children}</>;
  }

  // Se não, mostra a tela de bloqueio bonita com Tailwind
  return (
    <>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
      `}</style>
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
        <div className={`w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-lg transition-all duration-300 ${error ? "animate-shake border border-red-500 shadow-red-500/20" : ""}`}>
          <h2 className="mb-2 text-2xl font-black text-red-500">🔒 {title}</h2>
          <p className="mb-6 text-sm font-semibold text-gray-500">
            Digite o PIN de 4 dígitos para acessar
          </p>

          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              if (error) setError(false);
            }}
            onKeyDown={handleKeyDown}
            autoFocus
            className={`mb-2 w-full rounded-lg border-2 p-4 text-center text-4xl tracking-[0.5em] outline-none transition focus:border-red-500 ${error ? "border-red-500 text-red-500 bg-red-50" : "border-gray-300"}`}
            placeholder="****"
          />

          <div className="h-6 mb-4">
            {error && <p className="text-sm font-bold text-red-500">Senha incorreta.</p>}
          </div>

          <button
            onClick={handleUnlock}
            className="w-full rounded-lg bg-red-500 p-4 text-lg font-bold text-white transition hover:bg-red-600 active:scale-95"
          >
            Acessar Sistema
          </button>
        </div>
      </div>
    </>
  );
}
