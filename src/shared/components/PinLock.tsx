import { useState } from "react";

interface PinLockProps {
  children: React.ReactNode;
  correctPin: string;
  title: string;
}

export function PinLock({ children, correctPin, title }: PinLockProps) {
  const [pin, setPin] = useState("");
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
      alert("PIN incorreto!");
      setPin("");
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-lg">
        <h2 className="mb-2 text-2xl font-black text-red-500">🔒 {title}</h2>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Digite o PIN de 4 dígitos para acessar
        </p>

        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="mb-6 w-full rounded-lg border-2 border-gray-300 p-4 text-center text-4xl tracking-[0.5em] outline-none transition focus:border-red-500"
          placeholder="****"
        />

        <button
          onClick={handleUnlock}
          className="w-full rounded-lg bg-red-500 p-4 text-lg font-bold text-white transition hover:bg-red-600 active:scale-95"
        >
          Acessar Sistema
        </button>
      </div>
    </div>
  );
}
