import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  UserRound,
  AlertTriangle,
  X,
} from "lucide-react";
import { PinLock } from "@/shared/components/PinLock";
import { bebidas, pasteis, pizzas, porcoes, sucos, type PizzaSize } from "@/domain/menu/menu";
import { formatCurrency } from "@/shared/utils/format";
import { doc, setDoc, onSnapshot, collection, query } from "firebase/firestore";
import { db } from "@/services/firebase";

type CategoriaCarrinho = "pizza" | "pastel" | "porcao" | "bebida" | "suco";
type PagamentoMesa = "A DEFINIR NO CAIXA";
type CategoriaMenu = "pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos";

export interface ItemCarrinhoGarcom {
  key: string;
  id: number;
  nome: string;
  categoria: CategoriaCarrinho;
  precoUnitario: number;
  quantidade: number;
  tamanho?: PizzaSize;
  meia?: {
    saborA: string;
    saborB: string;
  };
}

export interface EstadoPedidoGarcom {
  nomeGarcom: string;
  numeroMesa: string;
  observacoes: string;
  carrinho: ItemCarrinhoGarcom[];
}

interface PedidoMesa {
  id: string;
  data: string;
  origem: string;
  garcom: string;
  mesa: string;
  pagamento: PagamentoMesa;
  itens: ItemCarrinhoGarcom[];
  subtotal: number;
  taxaEntrega: number;
  total: number;
  impresso: boolean;
  observacoes?: string;
  status?: string;
}

const GARCOM_DRAFT_KEY = "garcom-comanda-rascunho";
const SUCO_AO_LEITE_ACRESCIMO = 1;
const tamanhosPizza: PizzaSize[] = ["M", "G", "GG"];

// Sistema de Abas (Tabs) igual ao do cliente
const tabs: { id: CategoriaMenu; label: string }[] = [
  { id: "pizzas", label: "Pizzas" },
  { id: "pasteis", label: "Pastéis" },
  { id: "porcoes", label: "Porções" },
  { id: "bebidas", label: "Bebidas" },
  { id: "sucos", label: "Sucos" },
];

interface GarcomDraft extends EstadoPedidoGarcom {
  meiaTamanho: PizzaSize;
  meiaSaborA: string;
  meiaSaborB: string;
}

const garcomDraftDefault: GarcomDraft = {
  nomeGarcom: "",
  numeroMesa: "",
  observacoes: "",
  carrinho: [],
  meiaTamanho: "G",
  meiaSaborA: String(pizzas[0]?.id ?? ""),
  meiaSaborB: String(pizzas[1]?.id ?? ""),
};

const lerGarcomDraft = (): GarcomDraft => {
  const raw = localStorage.getItem(GARCOM_DRAFT_KEY);
  if (!raw) return garcomDraftDefault;

  try {
    const parsed = JSON.parse(raw) as Partial<GarcomDraft>;
    return {
      ...garcomDraftDefault,
      ...parsed,
      carrinho: Array.isArray(parsed.carrinho) ? parsed.carrinho : [],
    };
  } catch {
    return garcomDraftDefault;
  }
};

const gerarIdPedido = () =>
  globalThis.crypto?.randomUUID?.() ?? `MESA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export function WaiterOrderPage() {
  const [pinGarcom, setPinGarcom] = useState("5566");

  // Busca o PIN atualizado na nuvem antes de liberar o acesso
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "configuracoes", "seguranca"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().pinGarcom) {
        setPinGarcom(String(docSnap.data().pinGarcom));
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <PinLock correctPin={pinGarcom} title="Tela do Garçom">
      <GarcomPage />
    </PinLock>
  );
}

function GarcomPage() {
  const [rascunhoInicial] = useState(() => lerGarcomDraft());
  const [pedido, setPedido] = useState<EstadoPedidoGarcom>({
    nomeGarcom: rascunhoInicial.nomeGarcom,
    numeroMesa: rascunhoInicial.numeroMesa,
    observacoes: rascunhoInicial.observacoes,
    carrinho: rascunhoInicial.carrinho,
  });
  const [tab, setTab] = useState<CategoriaMenu>("pizzas"); // Controle da Aba Ativa
  const [meiaTamanho, setMeiaTamanho] = useState<PizzaSize>(rascunhoInicial.meiaTamanho);
  const [meiaSaborA, setMeiaSaborA] = useState(rascunhoInicial.meiaSaborA);
  const [meiaSaborB, setMeiaSaborB] = useState(rascunhoInicial.meiaSaborB);
  const [mensagemCarrinho, setMensagemCarrinho] = useState("");
  const [modalSucessoAberto, setModalSucessoAberto] = useState(false);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);

  // ESTADOS DE CONFIGURAÇÕES E ALERTAS
  const [esgotados, setEsgotados] = useState<number[]>([]);
  const [lojaAberta, setLojaAberta] = useState(true);
  const [mesasAbertas, setMesasAbertas] = useState<string[]>([]);
  const [tipoComplemento, setTipoComplemento] = useState<"acrescimo" | "correcao">("acrescimo");
  const [alerta, setAlerta] = useState<{
    titulo: string;
    mensagem: string;
    tipo: "sucesso" | "erro" | "aviso";
  } | null>(null);
  const [confirmarAcao, setConfirmarAcao] = useState<{
    mensagem: string;
    onConfirm: () => void;
  } | null>(null);

  const mensagemTimeoutRef = useRef<number | null>(null);

  const subtotal = useMemo(
    () => pedido.carrinho.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0),
    [pedido.carrinho],
  );

  useEffect(() => {
    const draft: GarcomDraft = {
      ...pedido,
      meiaTamanho,
      meiaSaborA,
      meiaSaborB,
    };
    localStorage.setItem(GARCOM_DRAFT_KEY, JSON.stringify(draft));
  }, [meiaSaborA, meiaSaborB, meiaTamanho, pedido]);

  // ESPIÃO DO CARDÁPIO (Para travar botões de itens esgotados)
  useEffect(() => {
    const unsubscribeLoja = onSnapshot(doc(db, "configuracoes", "loja"), (docSnap) => {
      if (docSnap.exists()) {
        setLojaAberta(docSnap.data().aberta);
      } else {
        setLojaAberta(true);
      }
    });

    const unsubscribeCardapio = onSnapshot(doc(db, "configuracoes", "cardapio"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().esgotados) {
        setEsgotados(docSnap.data().esgotados);
      }
    });

    return () => {
      unsubscribeLoja();
      unsubscribeCardapio();
    };
  }, []);

  // ESPIÃO DE MESAS ABERTAS (Para identificar acréscimos/retiradas)
  useEffect(() => {
    const unsubscribePedidos = onSnapshot(query(collection(db, "pedidos")), (snap) => {
      const mesas = new Set<string>();
      snap.forEach((d) => {
        const p = d.data() as PedidoMesa;
        if (p.status !== "cancelado" && p.status !== "finalizado" && p.mesa) {
          mesas.add(p.mesa);
        }
      });
      setMesasAbertas(Array.from(mesas));
    });
    return () => unsubscribePedidos();
  }, []);

  const isMesaAberta = mesasAbertas.includes(pedido.numeroMesa.trim());

  const avisarItemAdicionado = (nomeItem: string) => {
    setMensagemCarrinho(`${nomeItem} adicionado à mesa.`);
    if (mensagemTimeoutRef.current) window.clearTimeout(mensagemTimeoutRef.current);
    mensagemTimeoutRef.current = window.setTimeout(() => {
      setMensagemCarrinho("");
      mensagemTimeoutRef.current = null;
    }, 1800);
  };

  const adicionarItem = (item: Omit<ItemCarrinhoGarcom, "quantidade">) => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "O sistema está fechado no momento!",
        tipo: "aviso",
      });
      return;
    }
    if (esgotados.includes(item.id)) {
      setAlerta({
        titulo: "Esgotado",
        mensagem: "Aviso: Este item foi bloqueado pelo Caixa pois está ESGOTADO!",
        tipo: "erro",
      });
      return;
    }
    setPedido((estadoAtual) => {
      const existente = estadoAtual.carrinho.find((itemAtual) => itemAtual.key === item.key);
      const carrinho = existente
        ? estadoAtual.carrinho.map((itemAtual) =>
          itemAtual.key === item.key
            ? { ...itemAtual, quantidade: itemAtual.quantidade + 1 }
            : itemAtual,
        )
        : [...estadoAtual.carrinho, { ...item, quantidade: 1 }];
      return { ...estadoAtual, carrinho };
    });
    avisarItemAdicionado(item.nome);
  };

  const adicionarPizzaMeia = () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "O sistema está fechado no momento!",
        tipo: "aviso",
      });
      return;
    }
    const saborA = pizzas.find((pizza) => String(pizza.id) === meiaSaborA);
    const saborB = pizzas.find((pizza) => String(pizza.id) === meiaSaborB);

    if (!saborA || !saborB) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Escolha os dois sabores da pizza meia a meia.",
        tipo: "aviso",
      });
      return;
    }

    if (esgotados.includes(saborA.id) || esgotados.includes(saborB.id)) {
      setAlerta({
        titulo: "Sabor Esgotado",
        mensagem: "Aviso: Um dos sabores escolhidos está ESGOTADO!",
        tipo: "erro",
      });
      return;
    }

    adicionarItem({
      key: `pizza-meia-${meiaTamanho}-${saborA.id}-${saborB.id}`,
      id: saborA.id,
      nome: `Pizza meia ${saborA.name} / ${saborB.name}`,
      categoria: "pizza",
      tamanho: meiaTamanho,
      precoUnitario: Math.max(saborA.prices[meiaTamanho], saborB.prices[meiaTamanho]),
      meia: { saborA: saborA.name, saborB: saborB.name },
    });
  };

  const alterarQuantidade = (key: string, delta: number) => {
    if (!lojaAberta) return;
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho
        .map((item) => (item.key === key ? { ...item, quantidade: item.quantidade + delta } : item))
        .filter((item) => item.quantidade > 0),
    }));
  };

  const removerItem = (key: string) => {
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho.filter((item) => item.key !== key),
    }));
  };

  const limparPedido = () => {
    setConfirmarAcao({
      mensagem: "Deseja realmente limpar a comanda inteira?",
      onConfirm: () => {
        setPedido({
          nomeGarcom: "",
          numeroMesa: "",
          observacoes: "",
          carrinho: [],
        });
        setModalCarrinhoAberto(false);
      },
    });
  };

  // ENVIAR PEDIDO PARA O FIREBASE (CAIXA)
  const enviarPedido = async () => {
    if (!lojaAberta) {
      setAlerta({
        titulo: "Loja Fechada",
        mensagem: "A loja está fechada. Não é possível enviar comandos.",
        tipo: "aviso",
      });
      return;
    }
    if (!pedido.nomeGarcom.trim()) {
      setAlerta({ titulo: "Atenção", mensagem: "Informe o nome do garçom.", tipo: "aviso" });
      return;
    }

    if (!pedido.numeroMesa.trim()) {
      setAlerta({ titulo: "Atenção", mensagem: "Informe o número da mesa.", tipo: "aviso" });
      return;
    }

    if (pedido.carrinho.length === 0 && !pedido.observacoes.trim()) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Adicione itens ou uma observação para enviar.",
        tipo: "aviso",
      });
      return;
    }

    if (pedido.carrinho.length === 0 && !isMesaAberta) {
      setAlerta({
        titulo: "Atenção",
        mensagem: "Um novo pedido precisa ter pelo menos um item.",
        tipo: "aviso",
      });
      return;
    }

    let origemPedido = `MESA ${pedido.numeroMesa.trim()}`;
    if (isMesaAberta) {
      origemPedido = tipoComplemento === "acrescimo"
        ? `ACRÉSCIMO - MESA ${pedido.numeroMesa.trim()}`
        : `CORREÇÃO/RETIRADA - MESA ${pedido.numeroMesa.trim()}`;
    }

    const pedidoMesa: PedidoMesa = {
      id: gerarIdPedido(),
      data: new Date().toISOString(),
      origem: origemPedido,
      garcom: pedido.nomeGarcom.trim(),
      mesa: pedido.numeroMesa.trim(),
      pagamento: "A DEFINIR NO CAIXA",
      itens: pedido.carrinho,
      subtotal,
      taxaEntrega: 0,
      total: subtotal,
      impresso: false,
      observacoes: pedido.observacoes.trim(),
    };

    try {
      await setDoc(doc(db, "pedidos", pedidoMesa.id), pedidoMesa);
      localStorage.removeItem(GARCOM_DRAFT_KEY);
      setPedido({
        nomeGarcom: pedido.nomeGarcom, // Mantém o nome do garçom para facilitar
        numeroMesa: "",
        observacoes: "",
        carrinho: [],
      });
      setModalCarrinhoAberto(false);
      setModalSucessoAberto(true);
    } catch (error) {
      console.error("Erro ao enviar comanda:", error);
      setAlerta({
        titulo: "Erro",
        mensagem: "Falha ao enviar a comanda. Verifique sua conexão com a internet.",
        tipo: "erro",
      });
    }
  };

  const conteudoCarrinho = (isModal: boolean) => (
    <section className={`flex flex-col border-primary bg-card ${isModal ? "w-full max-w-lg max-h-[90vh] animate-in fade-in zoom-in-95 rounded-2xl shadow-2xl duration-200 border-2 overflow-hidden" : "rounded-lg border-2 shadow-[var(--shadow-warm)]"}`}>
      <div className={`flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground ${isModal ? "shrink-0" : "border-b border-border"}`}>
        <h2 className="flex items-center gap-2 text-lg font-black uppercase">
          <ShoppingCart size={20} aria-hidden="true" />
          Mesa {pedido.numeroMesa || "--"}
        </h2>
        <div className="flex items-center gap-3">
          <strong>{formatCurrency(subtotal)}</strong>
          {isModal && (
            <button
              type="button"
              onClick={() => setModalCarrinhoAberto(false)}
              className="rounded-full p-1 hover:bg-primary-foreground/20 transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      <div className={`p-3 sm:p-4 space-y-4 ${isModal ? "flex-1 overflow-y-auto" : ""}`}>
        <div>
          {pedido.carrinho.length === 0 ? (
            <div className={`grid place-items-center rounded-lg border border-dashed border-border bg-background px-6 text-center ${isModal ? "min-h-32" : "min-h-44"}`}>
              <p className="text-sm font-semibold text-muted-foreground">
                Nenhum item na comanda.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pedido.carrinho.map((item) => (
                <li
                  key={item.key}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-foreground">
                        {item.nome}
                        {item.tamanho && (
                          <span className="ml-2 text-primary">({item.tamanho})</span>
                        )}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {formatCurrency(item.precoUnitario)} cada
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removerItem(item.key)}
                      className="rounded-md p-1 text-destructive transition hover:bg-destructive/10"
                      aria-label={`Remover ${item.nome}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(item.key, -1)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary font-black text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
                        aria-label={`Diminuir ${item.nome}`}
                      >
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <span className="w-7 text-center text-sm font-black">
                        {item.quantidade}
                      </span>
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(item.key, 1)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                        aria-label={`Aumentar ${item.nome}`}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <strong className="text-sm font-black text-primary">
                      {formatCurrency(item.precoUnitario * item.quantidade)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-bold text-foreground">Observações da mesa</span>
          <textarea
            value={pedido.observacoes}
            onChange={(event) =>
              setPedido((estadoAtual) => ({
                ...estadoAtual,
                observacoes: event.target.value,
              }))
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Ex.: servir pratos antes, sem cebola"
          />
        </label>

        <div className="flex items-center justify-between rounded-lg bg-background border border-border p-3">
          <span className="text-sm font-black uppercase text-muted-foreground">Total</span>
          <span className="text-2xl font-black text-primary">{formatCurrency(subtotal)}</span>
        </div>
      </div>

      <div className={`border-t border-border bg-background p-4 ${isModal ? "shrink-0" : ""}`}>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={limparPedido}
            disabled={
              pedido.carrinho.length === 0 && !pedido.numeroMesa && !pedido.nomeGarcom
            }
            className="rounded-lg border border-border bg-background py-3 text-sm font-black uppercase text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={enviarPedido}
            disabled={pedido.carrinho.length === 0 && !pedido.observacoes.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-black uppercase text-primary-foreground shadow-[var(--shadow-warm)] transition hover:bg-[var(--brand-red-dark)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send size={17} aria-hidden="true" />
            Enviar
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-background pb-12 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Atendimento de mesa
            </p>
            <h1 className="text-2xl font-black text-primary">Painel do Garçom</h1>
            {!lojaAberta && (
              <div className="mt-2 inline-block rounded bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-md animate-pulse">
                ⚠️ Fechado no momento.
              </div>
            )}
          </div>
        </div>
      </header>

      {mensagemCarrinho && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-24 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800 shadow-[var(--shadow-card)]"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          {mensagemCarrinho}
        </div>
      )}

      {/* --- MODAL GLOBAL DE ALERTA --- */}
      {alerta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200 border border-border">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${alerta.tipo === "erro" ? "bg-red-100 text-red-600" : alerta.tipo === "sucesso" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}
            >
              {alerta.tipo === "erro" || alerta.tipo === "aviso" ? (
                <AlertTriangle size={36} strokeWidth={2.5} />
              ) : (
                <CheckCircle2 size={36} strokeWidth={2.5} />
              )}
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">{alerta.titulo}</h2>
            <p className="mb-6 font-semibold text-muted-foreground leading-relaxed">
              {alerta.mensagem}
            </p>
            <button
              onClick={() => setAlerta(null)}
              className="w-full rounded-xl bg-primary py-3 text-lg font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMAÇÃO --- */}
      {confirmarAcao && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200 border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <AlertTriangle size={36} strokeWidth={2.5} />
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">Atenção</h2>
            <p className="mb-6 font-semibold text-muted-foreground leading-relaxed">
              {confirmarAcao.mensagem}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarAcao(null)}
                className="flex-1 rounded-xl border border-border bg-background py-3 text-sm font-bold text-foreground transition hover:bg-muted active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  confirmarAcao.onConfirm();
                  setConfirmarAcao(null);
                }}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-[var(--brand-red-dark)] active:scale-95"
              >
                Sim, Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_390px]">
        <section
          className={`space-y-4 transition-all duration-300 ${!lojaAberta ? "pointer-events-none opacity-50 grayscale" : ""}`}
        >
          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <UserRound size={16} aria-hidden="true" />
                  Nome do Garçom
                </span>
                <input
                  value={pedido.nomeGarcom}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      nomeGarcom: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="Ex.: João"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-foreground">Número da Mesa</span>
                <input
                  value={pedido.numeroMesa}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      numeroMesa: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  inputMode="numeric"
                  className="h-11 w-full rounded-lg border-2 border-primary bg-background px-3 text-center text-lg font-black outline-none transition focus:ring-4 focus:ring-primary/10"
                  placeholder="00"
                />
              </label>
            </div>

            {isMesaAberta && (
              <div className="sm:col-span-2 mt-1 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 sm:p-4">
                <p className="text-sm font-black text-yellow-600 flex items-center gap-2 mb-2">
                  <AlertTriangle size={18} />
                  Mesa já aberta! Enviar como complemento:
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                  <label className="flex items-center gap-2 text-sm font-bold text-yellow-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={tipoComplemento === "acrescimo"}
                      onChange={() => setTipoComplemento("acrescimo")}
                      className="accent-yellow-600 w-4 h-4"
                    />
                    Acréscimo de Itens
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-yellow-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={tipoComplemento === "correcao"}
                      onChange={() => setTipoComplemento("correcao")}
                      className="accent-yellow-600 w-4 h-4"
                    />
                    Retirada / Correção
                  </label>
                </div>
                <p className="text-xs text-yellow-600/80 mt-2 font-semibold">
                  Será impresso um cupom sinalizando a cozinha sobre esta alteração.
                </p>
              </div>
            )}
          </div>

          {/* ÁREA DE ABAS E CARDÁPIO COMPLETO */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-black uppercase transition ${tab === item.id
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-warm)]"
                    : "bg-background text-foreground hover:bg-secondary"
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* ABA: PIZZAS */}
            {tab === "pizzas" && (
              <div className="grid gap-3">
                <div className="rounded-lg border-2 border-dashed border-primary/45 bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-foreground">Pizza meia a meia</h2>
                      <p className="text-sm font-medium text-muted-foreground">
                        O valor usa o maior preço entre os sabores escolhidos.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_auto] items-center">
                    <select
                      value={meiaTamanho}
                      onChange={(event) => setMeiaTamanho(event.target.value as PizzaSize)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-black outline-none focus:border-primary"
                    >
                      {tamanhosPizza.map((tamanho) => (
                        <option key={tamanho} value={tamanho}>
                          {tamanho}
                        </option>
                      ))}
                    </select>
                    <select
                      value={meiaSaborA}
                      onChange={(event) => setMeiaSaborA(event.target.value)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                    >
                      {pizzas.map((pizza) => (
                        <option
                          key={pizza.id}
                          value={pizza.id}
                          disabled={esgotados.includes(pizza.id)}
                          className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}
                        >
                          {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={meiaSaborB}
                      onChange={(event) => setMeiaSaborB(event.target.value)}
                      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                    >
                      {pizzas.map((pizza) => (
                        <option
                          key={pizza.id}
                          value={pizza.id}
                          disabled={esgotados.includes(pizza.id)}
                          className={esgotados.includes(pizza.id) ? "text-red-600 font-bold" : ""}
                        >
                          {pizza.name} {esgotados.includes(pizza.id) ? "(ESGOTADO)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={adicionarPizzaMeia}
                      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black uppercase text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                    >
                      <Plus size={17} aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </div>

                {pizzas.map((pizza) => {
                  const esgotado = esgotados.includes(pizza.id);
                  return (
                    <article
                      key={pizza.id}
                      className={`rounded-lg border border-border bg-background p-4 transition hover:border-primary hover:shadow-[var(--shadow-card)] ${esgotado ? "opacity-40 grayscale pointer-events-none" : ""}`}
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-foreground">
                            <span className="mr-2 text-primary">
                              {String(pizza.id).padStart(2, "0")}.
                            </span>
                            {pizza.name}
                          </h3>
                          {pizza.description && (
                            <p className="mt-1 text-sm font-medium text-muted-foreground">
                              {pizza.description}
                            </p>
                          )}
                          {pizza.highlight && (
                            <p className="mt-2 text-xs font-black uppercase text-primary">
                              {pizza.highlight}
                            </p>
                          )}
                        </div>
                        {esgotado && (
                          <span className="bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase rounded">
                            ESGOTADO
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {tamanhosPizza.map((tamanho) => (
                          <button
                            key={tamanho}
                            type="button"
                            disabled={esgotado}
                            onClick={() =>
                              adicionarItem({
                                key: `pizza-${pizza.id}-${tamanho}`,
                                id: pizza.id,
                                nome: `Pizza ${pizza.name}`,
                                categoria: "pizza",
                                tamanho,
                                precoUnitario: pizza.prices[tamanho],
                              })
                            }
                            className="rounded-lg border-2 border-secondary bg-card px-3 py-2 text-center transition hover:border-primary hover:bg-secondary"
                          >
                            <span className="block text-xs font-black text-primary">{tamanho}</span>
                            <span className="block text-sm font-black text-foreground">
                              {formatCurrency(pizza.prices[tamanho])}
                            </span>
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* DEMAIS ABAS (Pastéis, Porções, Bebidas, Sucos) */}
            {tab !== "pizzas" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(tab === "pasteis"
                  ? pasteis
                  : tab === "porcoes"
                    ? porcoes
                    : tab === "bebidas"
                      ? bebidas
                      : sucos
                ).map((item) => {
                  const esgotado = esgotados.includes(item.id);
                  if (tab === "sucos") {
                    return (
                      <article
                        key={item.id}
                        className={`rounded-lg border border-border bg-background p-4 transition hover:border-primary hover:shadow-[var(--shadow-card)] ${esgotado ? "opacity-40 grayscale pointer-events-none" : ""}`}
                      >
                        <div className="mb-3 flex justify-between items-start">
                          <div>
                            <h3 className="text-base font-black text-foreground">
                              <span className="mr-2 text-primary">{item.id}.</span>
                              {item.name}
                            </h3>
                            <p className="text-xs font-semibold text-muted-foreground">
                              Ao leite tem acréscimo de {formatCurrency(SUCO_AO_LEITE_ACRESCIMO)}.
                            </p>
                          </div>
                          {esgotado && (
                            <span className="bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase rounded">
                              ESGOTADO
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={esgotado}
                            onClick={() =>
                              adicionarItem({
                                key: `suco-${item.id}-natural`,
                                id: item.id,
                                nome: `Suco ${item.name}`,
                                categoria: "suco", // Corrigido para "suco"
                                precoUnitario: item.price,
                              })
                            }
                            className="rounded-lg border border-secondary bg-card px-3 py-2 text-left transition hover:border-primary hover:bg-secondary"
                          >
                            <span className="block text-xs font-black uppercase text-muted-foreground">
                              Natural
                            </span>
                            <span className="block text-sm font-black text-foreground">
                              {formatCurrency(item.price)}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={esgotado}
                            onClick={() =>
                              adicionarItem({
                                key: `suco-${item.id}-ao-leite`,
                                id: item.id,
                                nome: `Suco ${item.name} ao leite`,
                                categoria: "suco", // Corrigido para "suco"
                                precoUnitario: item.price + SUCO_AO_LEITE_ACRESCIMO,
                              })
                            }
                            className="rounded-lg border border-primary bg-secondary px-3 py-2 text-left transition hover:border-primary hover:bg-[var(--brand-yellow-light)]"
                          >
                            <span className="block text-xs font-black uppercase text-primary">
                              Ao leite
                            </span>
                            <span className="block text-sm font-black text-foreground">
                              {formatCurrency(item.price + SUCO_AO_LEITE_ACRESCIMO)}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={esgotado}
                      onClick={() =>
                        adicionarItem({
                          key: `${tab}-${item.id}`,
                          id: item.id,
                          nome: item.name,
                          categoria:
                            tab === "pasteis" ? "pastel" : tab === "porcoes" ? "porcao" : "bebida",
                          precoUnitario: item.price,
                        })
                      }
                      className={`flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary hover:shadow-[var(--shadow-card)] ${esgotado ? "opacity-40 grayscale pointer-events-none" : ""}`}
                    >
                      <span>
                        <span className="block text-base font-black text-foreground">
                          <span className="mr-2 text-primary">{item.id}.</span>
                          {item.name}
                          {esgotado && (
                            <span className="ml-2 bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase rounded">
                              ESGOTADO
                            </span>
                          )}
                        </span>
                        {item.description && (
                          <span className="mt-1 block text-xs font-medium text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-lg bg-secondary px-3 py-2 text-sm font-black text-secondary-foreground">
                        {formatCurrency(item.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside
          className={`hidden lg:block lg:sticky lg:top-24 lg:self-start transition-all duration-300 ${!lojaAberta ? "pointer-events-none opacity-50 grayscale" : ""}`}
        >
          {conteudoCarrinho(false)}
        </aside>
      </div>

      {/* MODAL DO CARRINHO (Apenas Mobile) */}
      {modalCarrinhoAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity lg:hidden">
          {conteudoCarrinho(true)}
        </div>
      )}

      {modalSucessoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>

            <h2 className="mb-2 text-2xl font-black text-foreground">
              Mesa {pedido.numeroMesa} Enviada!
            </h2>
            <p className="mb-6 font-semibold text-muted-foreground">
              A comanda foi encaminhada para o caixa com sucesso.
            </p>

            <button
              type="button"
              onClick={() => setModalSucessoAberto(false)}
              className="w-full rounded-xl bg-primary py-3 text-lg font-bold text-primary-foreground shadow-md transition hover:bg-[var(--brand-red-dark)] active:scale-95"
            >
              Fazer novo pedido
            </button>
          </div>
        </div>
      )}

      {/* BOTÃO FLUTUANTE DO CARRINHO (Apenas Mobile/Tablets) */}
      {(pedido.carrinho.length > 0 || pedido.observacoes.trim().length > 0) && (
        <button
          type="button"
          onClick={() => setModalCarrinhoAberto(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-primary px-5 py-3.5 font-black text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-transform hover:scale-105 active:scale-95 border-2 border-primary-foreground/20 lg:hidden"
        >
          <div className="relative flex items-center">
            <ShoppingCart size={24} />
            <span className="absolute -right-2.5 -top-2.5 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-background text-[11px] text-primary shadow-sm border border-border">
              {pedido.carrinho.reduce((totalItens, item) => totalItens + item.quantidade, 0)}
            </span>
          </div>
          <span className="flex flex-col text-left border-l border-primary-foreground/30 pl-3 ml-1">
            <span className="text-[10px] uppercase tracking-wider leading-none opacity-90 mb-1">Ver Comanda</span>
            <span className="text-sm leading-none">{formatCurrency(subtotal)}</span>
          </span>
        </button>
      )}
    </main>
  );
}
