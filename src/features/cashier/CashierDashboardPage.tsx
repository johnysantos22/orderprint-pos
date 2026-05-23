import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  Printer,
  DollarSign,
  TrendingUp,
  Volume2,
  VolumeX,
  Store,
  Edit3,
  Trash2,
  X,
  Plus,
  Minus,
  BarChart3,
  Filter,
  Ban,
  ShoppingBag,
  AlertTriangle,
  Settings,
  Lock,
  CalendarDays,
} from "lucide-react";
import { PinLock } from "@/shared/components/PinLock";
import somCampainha from "@/assets/campainha.mp3";
import { collection, onSnapshot, query, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import logo from "@/assets/logo.jpeg";
import { pizzas, pasteis, porcoes, bebidas, sucos } from "@/domain/menu/menu";
import { printTextOnDefaultPrinter } from "@/features/printing/printBridge";
import { createReceiptText } from "@/features/printing/receiptText";
import { formatCurrency, formatDateTime } from "@/shared/utils/format";

export function CashierDashboardPage() {
  // Inicia com o valor salvo no cache (se existir) para evitar a piscada no F5
  const [pinCaixa, setPinCaixa] = useState<string | null>(() => localStorage.getItem("cachedPinCaixa"));

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "configuracoes", "seguranca"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().pinCaixa) {
        const pin = String(docSnap.data().pinCaixa);
        localStorage.setItem("cachedPinCaixa", pin);
        setPinCaixa(pin);
      } else {
        // Se não existir senha salva, define como vazio para ninguém entrar com "1234"
        localStorage.setItem("cachedPinCaixa", "");
        setPinCaixa("");
      }
    });
    return () => unsubscribe();
  }, []);

  if (pinCaixa === null) {
    // Tela com fundo liso sem texto para não dar aquele "pulo" visual no primeiro acesso
    return <div className="h-screen w-full bg-background" />;
  }

  return (
    <PinLock correctPin={pinCaixa} title="Painel de Controle">
      <CaixaPage />
    </PinLock>
  );
}

interface ItemPedido {
  key: string;
  id: number;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  tamanho?: string;
  categoria?: string;
  meia?: { saborA: string; saborB: string };
}

export interface Pedido {
  id: string;
  data: string;
  origem: string;
  pagamento: string;
  itens: ItemPedido[];
  subtotal: number;
  taxaEntrega?: number;
  total: number;
  impresso: boolean;
  impressoEm?: string;
  observacoes?: string;
  mesa?: string;
  garcom?: string;
  cliente?: { nome: string; endereco?: string };
  tipoEntrega?: string;
  status?: string;
}

function CaixaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoParaImprimir, setPedidoParaImprimir] = useState<Pedido | null>(null);
  const [statusImpressao, setStatusImpressao] = useState("Aguardando pedidos.");
  const [pedidoComFalha, setPedidoComFalha] = useState<Pedido | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const imprimindoRef = useRef(false);
  const pedidosRef = useRef<Pedido[]>([]);

  const [lojaAberta, setLojaAberta] = useState(true);
  const [draftPedidoEdicao, setDraftPedidoEdicao] = useState<Pedido | null>(null);
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState<string | null>(null);
  const [filtroTempo, setFiltroTempo] = useState<"hoje" | "semana" | "mes" | "todos">("hoje");
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  const [telaAtiva, setTelaAtiva] = useState<"dashboard" | "config" | "mesas">("mesas");
  const [abaConfig, setAbaConfig] = useState<"estoque" | "senhas" | "loja">("estoque");
  const [esgotados, setEsgotados] = useState<number[]>([]);
  const [inputPinCaixa, setInputPinCaixa] = useState("");
  const [inputPinGarcom, setInputPinGarcom] = useState("");
  const [horarioFuncionamento, setHorarioFuncionamento] = useState(
    "🕒Quarta a Domingo | das 18h às 22h.",
  );
  const [categoriaConfig, setCategoriaConfig] = useState<
    "pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos"
  >("pizzas");

  const [horaAtual, setHoraAtual] = useState(new Date());

  const [alerta, setAlerta] = useState<{
    titulo: string;
    mensagem: string;
    tipo: "sucesso" | "erro" | "aviso";
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<string | null>(null);
  const [buscaMesa, setBuscaMesa] = useState("");

  const atendimentosAbertos = useMemo(() => {
    const mesas = new Map<string, Pedido[]>();
    const outros: Pedido[] = [];

    pedidos.forEach((p) => {
      if (p.status !== "cancelado" && p.status !== "finalizado") {
        if (p.mesa) {
          if (!mesas.has(p.mesa)) mesas.set(p.mesa, []);
          mesas.get(p.mesa)!.push(p);
        } else {
          outros.push(p);
        }
      }
    });

    const listaMesas = Array.from(mesas.entries())
      .map(([mesa, peds]) => ({
        tipo: "mesa" as const,
        id: `mesa-${mesa}`,
        titulo: `Mesa ${mesa}`,
        pedidos: peds,
        total: peds.reduce((acc, p) => acc + p.total, 0),
        data: peds[0].data,
        origem: peds[0].origem,
      }))
      .sort((a, b) => {
        const numA = Number(a.titulo.replace(/\D/g, ""));
        const numB = Number(b.titulo.replace(/\D/g, ""));
        return numA - numB;
      });

    const listaOutros = outros
      .map((p) => ({
        tipo: "outro" as const,
        id: p.id,
        titulo: p.cliente?.nome || p.origem,
        pedidos: [p],
        total: p.total,
        data: p.data,
        origem: p.origem,
      }))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    return [...listaMesas, ...listaOutros];
  }, [pedidos]);

  const atendimentosFiltrados = useMemo(() => {
    if (!buscaMesa.trim()) return atendimentosAbertos;
    return atendimentosAbertos.filter((a) =>
      a.titulo.toLowerCase().includes(buscaMesa.toLowerCase()),
    );
  }, [atendimentosAbertos, buscaMesa]);

  const atendimentoAtual = atendimentosAbertos.find((a) => a.id === atendimentoSelecionado);

  const imprimirCupom = useCallback(async (pedido: Pedido) => {
    setPedidoParaImprimir(pedido);

    try {
      await printTextOnDefaultPrinter(createReceiptText(pedido));
    } catch (error) {
      console.warn("Ponte de impressao indisponivel. Usando impressao do navegador.", error);
      setStatusImpressao("Ponte local indisponivel; abrindo impressao do navegador.");

      await new Promise((resolve) => setTimeout(resolve, 300));
      window.print();
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }, []);

  const finalizarAtendimento = async (atend: (typeof atendimentosAbertos)[0]) => {
    try {
      for (const p of atend.pedidos) {
        await updateDoc(doc(db, "pedidos", p.id), { status: "finalizado" });
      }
      setAtendimentoSelecionado(null);
      setAlerta({
        titulo: "Sucesso",
        mensagem: `${atend.titulo} finalizado com sucesso!`,
        tipo: "sucesso",
      });
    } catch {
      setAlerta({
        titulo: "Erro",
        mensagem: "Não foi possível finalizar o atendimento.",
        tipo: "erro",
      });
    }
  };

  const imprimirConferencia = async (atend: (typeof atendimentosAbertos)[0]) => {
    const itensConsolidados = atend.pedidos.flatMap((p) => p.itens);
    const pedidoConferencia: Pedido = {
      id: `CONF-${atend.titulo.replace(/\s+/g, "-")}`,
      data: new Date().toISOString(),
      origem: atend.titulo,
      pagamento: "A DEFINIR",
      itens: itensConsolidados,
      subtotal: atend.total,
      total: atend.total,
      impresso: true,
      observacoes: "*** CONFERÊNCIA DE MESA ***",
    };
    setStatusImpressao(`Imprimindo conferencia: ${atend.titulo}`);
    await imprimirCupom(pedidoConferencia);
    setStatusImpressao(`Conferencia impressa: ${atend.titulo}`);
  };

  const pendentes = pedidos.filter(
    (pedido) => !pedido.impresso && pedido.status !== "cancelado",
  ).length;
  const pendentesAnteriorRef = useRef(pendentes);

  useEffect(() => {
    if (somAtivo && pendentes > pendentesAnteriorRef.current) {
      const audio = new Audio(somCampainha);
      audio.play().catch(() => console.warn("Audio travado"));
    }
    pendentesAnteriorRef.current = pendentes;
  }, [pendentes, somAtivo]);

  const periodos = useMemo(() => {
    const hojeData = new Date();
    hojeData.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(hojeData);
    inicioSemana.setDate(hojeData.getDate() - hojeData.getDay());
    const inicioMes = new Date(hojeData.getFullYear(), hojeData.getMonth(), 1);
    return { hojeData, inicioSemana, inicioMes };
  }, []);

  const statsPeriodo = useMemo(() => {
    let faturamento = 0;
    let qtdPedidos = 0;
    pedidos.forEach((pedido) => {
      if (pedido.status === "cancelado") return;
      const dataPedido = new Date(pedido.data);
      let incluir = false;
      if (filtroTempo === "todos") incluir = true;
      else if (filtroTempo === "hoje" && dataPedido >= periodos.hojeData) incluir = true;
      else if (filtroTempo === "semana" && dataPedido >= periodos.inicioSemana) incluir = true;
      else if (filtroTempo === "mes" && dataPedido >= periodos.inicioMes) incluir = true;

      if (incluir) {
        faturamento += pedido.total;
        qtdPedidos++;
      }
    });
    return { faturamento, qtdPedidos, ticketMedio: qtdPedidos > 0 ? faturamento / qtdPedidos : 0 };
  }, [pedidos, filtroTempo, periodos]);

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((pedido) => {
      if (mostrarCancelados) {
        if (pedido.status !== "cancelado") return false;
      } else {
        if (pedido.status === "cancelado") return false;
      }

      if (filtroTempo === "todos") return true;
      const dataPedido = new Date(pedido.data);
      if (filtroTempo === "hoje" && dataPedido >= periodos.hojeData) return true;
      if (filtroTempo === "semana" && dataPedido >= periodos.inicioSemana) return true;
      if (filtroTempo === "mes" && dataPedido >= periodos.inicioMes) return true;
      return false;
    });
  }, [pedidos, filtroTempo, mostrarCancelados, periodos]);

  const tituloDashboard =
    filtroTempo === "hoje"
      ? "de Hoje"
      : filtroTempo === "semana"
        ? "desta Semana"
        : filtroTempo === "mes"
          ? "deste Mês"
          : "Total";

  const imprimirPedido = useCallback(
    async (p: Pedido, m = false) => {
      setStatusImpressao(m ? `Imprimindo: ${p.origem}` : `Processando: ${p.origem}`);
      try {
        await imprimirCupom(p);

        if (!p.impresso) {
          await updateDoc(doc(db, "pedidos", p.id), {
            impresso: true,
            impressoEm: new Date().toISOString(),
          });
        }
        setPedidoComFalha(null);
        setStatusImpressao(`Cupom processado: ${p.origem}`);
      } catch {
        setPedidoComFalha(p);
        setStatusImpressao("Falha ao processar o pedido.");
      }
    },
    [imprimirCupom],
  );

  const processarPedidos = useCallback(async () => {
    if (imprimindoRef.current) return;
    imprimindoRef.current = true;
    try {
      let temPendente = true;
      while (temPendente) {
        // Pega o estado mais atualizado e inverte para imprimir o mais antigo primeiro
        const pendente = [...pedidosRef.current]
          .reverse()
          .find((p) => !p.impresso && p.status !== "cancelado");
        if (pendente) {
          await imprimirPedido(pendente);
        } else {
          temPendente = false;
        }
      }
    } finally {
      imprimindoRef.current = false;
    }
  }, [imprimirPedido]);

  useEffect(() => {
    const unsubPedidos = onSnapshot(query(collection(db, "pedidos")), (snap) => {
      const p: Pedido[] = [];
      snap.forEach((d) => p.push(d.data() as Pedido));
      const ord = p.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setPedidos(ord);
      pedidosRef.current = ord;
      processarPedidos();
    });
    const unsubLoja = onSnapshot(doc(db, "configuracoes", "loja"), (snap) => {
      if (snap.exists()) {
        setLojaAberta(snap.data().aberta);
        if (snap.data().horarioFuncionamento)
          setHorarioFuncionamento(snap.data().horarioFuncionamento);
      }
    });
    const unsubCardapio = onSnapshot(doc(db, "configuracoes", "cardapio"), (snap) => {
      if (snap.exists() && snap.data().esgotados) setEsgotados(snap.data().esgotados);
    });
    const unsubSeguranca = onSnapshot(doc(db, "configuracoes", "seguranca"), (snap) => {
      if (snap.exists()) {
        setInputPinCaixa(String(snap.data().pinCaixa || ""));
        setInputPinGarcom(String(snap.data().pinGarcom || ""));
      }
    });
    return () => {
      unsubPedidos();
      unsubLoja();
      unsubCardapio();
      unsubSeguranca();
    };
  }, [processarPedidos]);

  const handleToggleLoja = async () => {
    const novo = !lojaAberta;
    setLojaAberta(novo);
    try {
      await setDoc(doc(db, "configuracoes", "loja"), { aberta: novo }, { merge: true });
    } catch {
      setLojaAberta(!novo);
      setAlerta({
        titulo: "Erro",
        mensagem: "Erro de permissão no Firebase. Verifique as Regras.",
        tipo: "erro",
      });
    }
  };

  const handleToggleEsgotado = async (id: number) => {
    let nova = [...esgotados];
    if (nova.includes(id)) nova = nova.filter((i) => i !== id);
    else nova.push(id);
    setEsgotados(nova);
    await setDoc(doc(db, "configuracoes", "cardapio"), { esgotados: nova }, { merge: true });
  };

  const handleSalvarSenha = async (tipo: "caixa" | "garcom") => {
    const pin = tipo === "caixa" ? inputPinCaixa.trim() : inputPinGarcom.trim();
    if (pin.length < 4) {
      setAlerta({
        titulo: "Senha Curta",
        mensagem: `A senha do ${tipo === "caixa" ? "CAIXA" : "GARÇOM"} precisa ter no mínimo 4 números.`,
        tipo: "aviso",
      });
      return;
    }
    try {
      const updateData = tipo === "caixa" ? { pinCaixa: pin } : { pinGarcom: pin };
      await setDoc(doc(db, "configuracoes", "seguranca"), updateData, { merge: true });
      setAlerta({
        titulo: "Sucesso!",
        mensagem: `A senha do ${tipo === "caixa" ? "Caixa" : "Garçom"} foi alterada com sucesso!`,
        tipo: "sucesso",
      });
    } catch {
      setAlerta({
        titulo: "Erro",
        mensagem: "Não foi possível salvar a senha na nuvem.",
        tipo: "erro",
      });
    }
  };

  const handleSalvarHorario = async () => {
    try {
      await setDoc(doc(db, "configuracoes", "loja"), { horarioFuncionamento }, { merge: true });
      setAlerta({
        titulo: "Sucesso!",
        mensagem: `O horário de funcionamento foi atualizado!`,
        tipo: "sucesso",
      });
    } catch {
      setAlerta({ titulo: "Erro", mensagem: "Não foi possível salvar o horário.", tipo: "erro" });
    }
  };

  const confirmarCancelamento = async () => {
    if (!pedidoParaCancelar) return;
    try {
      await updateDoc(doc(db, "pedidos", pedidoParaCancelar), { status: "cancelado" });
      setPedidoParaCancelar(null);
    } catch {
      setAlerta({
        titulo: "Erro",
        mensagem: "Não foi possível cancelar o pedido no sistema.",
        tipo: "erro",
      });
    }
  };

  // FUNÇÃO ADICIONADA PARA CORRIGIR O ERRO TS(2304)
  const abrirModalEdicao = (pedido: Pedido) => {
    setDraftPedidoEdicao(JSON.parse(JSON.stringify(pedido)));
  };

  const alterarQtdItemDraft = (key: string, delta: number) => {
    setDraftPedidoEdicao((prev) => {
      if (!prev) return prev;
      const novos = prev.itens
        .map((i) => (i.key === key ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0);
      const sub = novos.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
      return { ...prev, itens: novos, subtotal: sub, total: sub + (prev.taxaEntrega || 0) };
    });
  };

  const removerItemDraft = (key: string) => {
    setDraftPedidoEdicao((prev) => {
      if (!prev) return prev;
      const novos = prev.itens.filter((i) => i.key !== key);
      const sub = novos.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0);
      return { ...prev, itens: novos, subtotal: sub, total: sub + (prev.taxaEntrega || 0) };
    });
  };

  const handleSalvarEdicaoItens = async () => {
    if (!draftPedidoEdicao) return;
    try {
      await updateDoc(doc(db, "pedidos", draftPedidoEdicao.id), {
        itens: draftPedidoEdicao.itens,
        subtotal: draftPedidoEdicao.subtotal,
        total: draftPedidoEdicao.total,
      });
      setDraftPedidoEdicao(null);
    } catch {
      setAlerta({ titulo: "Erro", mensagem: "Erro ao atualizar o pedido.", tipo: "erro" });
    }
  };

  const itensMenuDaCategoria = useMemo(() => {
    if (categoriaConfig === "pizzas") return pizzas.map((p) => ({ id: p.id, name: p.name }));
    if (categoriaConfig === "pasteis") return pasteis;
    if (categoriaConfig === "porcoes") return porcoes;
    if (categoriaConfig === "bebidas") return bebidas;
    return sucos;
  }, [categoriaConfig]);

  return (
    <>
      <style>{`
        #cupom-impressao { display: none; }
        @media print {
          @page { size: 58mm auto; margin: 2mm; }
          html, body { background: #fff !important; color: #000 !important; }
          .caixa-layout { display: none !important; }
          #cupom-impressao { display: block !important; width: 48mm; margin: 0 auto; color: #000; font-family: monospace; font-size: 8pt; padding-bottom: 18mm; }
          #cupom-impressao .linha { display: flex; justify-content: space-between; gap: 8px; }
          #cupom-impressao .centro { text-align: center; }
          #cupom-impressao .forte { font-weight: 800; }
          #cupom-impressao .divisor { margin: 5px 0; text-align: center; white-space: pre; }
        }
      `}</style>

      <div className="flex h-screen w-full bg-background overflow-hidden caixa-layout">
        <aside
          className={`w-full md:w-80 flex-shrink-0 border-r border-border bg-card flex-col h-full overflow-hidden shadow-[var(--shadow-card)] z-20 ${!atendimentoSelecionado && telaAtiva === "mesas" ? "flex" : "hidden md:flex"}`}
        >
          <div className="p-3 md:p-6 border-b border-border flex flex-col items-center justify-center bg-background">
            <img
              src={logo}
              alt="Logo"
              className="hidden md:block h-16 w-16 lg:h-20 lg:w-20 mb-3 rounded-2xl object-cover ring-4 ring-primary/10 shadow-lg"
            />
            <span className="text-[10px] md:text-xs font-bold text-muted-foreground text-center bg-muted/50 px-3 py-1.5 rounded-lg border border-border w-full md:w-auto">
              {horarioFuncionamento}
            </span>
          </div>

          <div className="p-2 md:p-3 border-b border-border grid grid-cols-2 md:flex md:flex-col gap-2 bg-muted/10">
            <button
              onClick={() => {
                setAtendimentoSelecionado(null);
                setTelaAtiva("dashboard");
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-black transition-all shadow-sm ${!atendimentoSelecionado && (telaAtiva === "dashboard" || telaAtiva === "mesas") ? "bg-primary text-white" : "bg-card border border-border text-foreground hover:bg-muted"}`}
            >
              <BarChart3 size={16} className="md:w-[18px] md:h-[18px]" />{" "}
              <span className="hidden sm:inline md:hidden lg:inline">Painel Geral</span>
              <span className="sm:hidden md:inline lg:hidden">Painel</span>
            </button>
            <button
              onClick={() => {
                setAtendimentoSelecionado(null);
                setTelaAtiva("config");
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-black transition-all shadow-sm ${!atendimentoSelecionado && telaAtiva === "config" ? "bg-zinc-800 text-white" : "bg-card border border-border text-foreground hover:bg-muted"}`}
            >
              <Settings size={16} className="md:w-[18px] md:h-[18px]" />{" "}
              <span className="hidden sm:inline md:hidden lg:inline">Configurações</span>
              <span className="sm:hidden md:inline lg:hidden">Config</span>
            </button>
            <button
              onClick={handleToggleLoja}
              className={`flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-black transition-all shadow-sm ${lojaAberta ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-500 text-white hover:bg-red-600"}`}
            >
              <Store size={16} className="md:w-[18px] md:h-[18px]" />{" "}
              {lojaAberta ? "Aberta" : "Fechada"}
            </button>
            <button
              onClick={() => setSomAtivo(!somAtivo)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold shadow-sm transition-all ${somAtivo ? "border-green-500 bg-green-50 text-green-700" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {somAtivo ? (
                <Volume2 size={16} className="md:w-[18px] md:h-[18px]" />
              ) : (
                <VolumeX size={16} className="md:w-[18px] md:h-[18px]" />
              )}{" "}
              <span className="hidden sm:inline">{somAtivo ? "Som Ativado" : "Mutado"}</span>
            </button>
            <Link
              to="/garcom"
              className="flex items-center justify-center rounded-lg border border-border bg-card shadow-sm px-2.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-all col-span-2 md:col-span-1"
            >
              Acesso Garçom
            </Link>
          </div>

          <div className="p-2 md:p-3 border-b border-border bg-background">
            <input
              type="text"
              placeholder="Buscar mesa ou cliente..."
              value={buscaMesa}
              onChange={(e) => setBuscaMesa(e.target.value)}
              className="w-full h-10 rounded-lg border border-border px-3 text-xs md:text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm bg-muted/20"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 md:p-3 space-y-1.5 bg-muted/5">
            {atendimentosFiltrados.length === 0 && (
              <p className="text-center text-sm font-semibold text-muted-foreground p-4">
                Nenhum atendimento aberto.
              </p>
            )}
            {atendimentosFiltrados.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAtendimentoSelecionado(a.id);
                  setTelaAtiva("mesas");
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${atendimentoSelecionado === a.id ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/40 shadow-sm"}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <strong className="font-black text-foreground text-sm md:text-base">{a.titulo}</strong>
                  {a.tipo === "outro" && (
                    <span className="text-[10px] font-black uppercase bg-secondary px-2 py-1 rounded-md text-secondary-foreground">
                      {a.origem}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs mt-1.5">
                  <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                    <ShoppingBag size={14} />{" "}
                    {a.pedidos.length > 1
                      ? `${a.pedidos.length} pedidos`
                      : `${a.pedidos[0].itens.length} itens`}
                  </span>
                  <span className="font-black text-primary text-sm md:text-base">
                    {formatCurrency(a.total)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full bg-muted/10 overflow-hidden relative">
          {atendimentoAtual ? (
            <div className="flex flex-col h-full">
              <div className="px-4 sm:px-6 py-3 md:py-4 border-b border-border bg-card flex justify-between items-center shadow-sm z-10">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-foreground">{atendimentoAtual.titulo}</h2>
                  <p className="text-xs md:text-sm font-bold text-muted-foreground uppercase mt-0.5 flex items-center gap-1.5">
                    <Clock size={14} /> Aberto em {formatDateTime(atendimentoAtual.data)}
                  </p>
                </div>
                <button
                  onClick={() => setAtendimentoSelecionado(null)}
                  className="h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded-full bg-muted hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6">
                <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
                  {atendimentoAtual.pedidos.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
                    >
                      <div className="bg-muted/30 px-4 sm:px-5 py-3 border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="font-black text-sm md:text-base">
                            Pedido #{p.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] md:text-xs font-black uppercase px-2 py-1 rounded-md ${p.impresso ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700 animate-pulse ring-1 ring-orange-300"}`}
                          >
                            {p.impresso ? "Impresso" : "Pendente"}
                          </span>
                        </div>
                        <div className="flex gap-1.5 md:gap-2">
                          <button
                            onClick={() => imprimirPedido(p, true)}
                            className="h-8 w-8 md:h-9 md:w-9 flex items-center justify-center rounded-lg bg-white border shadow-sm hover:bg-zinc-50"
                            title="Imprimir"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={() => abrirModalEdicao(p)}
                            className="h-8 w-8 md:h-9 md:w-9 flex items-center justify-center rounded-lg bg-blue-50 border border-blue-200 text-blue-600 shadow-sm hover:bg-blue-100"
                            title="Editar"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => setPedidoParaCancelar(p.id)}
                            className="h-8 w-8 md:h-9 md:w-9 flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-600 shadow-sm hover:bg-red-100"
                            title="Cancelar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 sm:p-5">
                        <table className="w-full text-xs md:text-sm">
                          <tbody>
                            {p.itens.map((item) => (
                              <tr
                                key={item.key}
                                className="border-b last:border-0 border-border/50"
                              >
                                <td className="py-2 font-black text-sm md:text-base w-12 md:w-16">
                                  {item.quantidade}x
                                </td>
                                <td className="py-2 font-bold text-sm md:text-base">
                                  {item.nome}{" "}
                                  {item.tamanho && (
                                    <span className="text-primary ml-1 text-xs md:text-sm">({item.tamanho})</span>
                                  )}
                                </td>
                                <td className="py-2 text-right text-muted-foreground font-semibold w-20 md:w-28">
                                  {formatCurrency(item.precoUnitario)}
                                </td>
                                <td className="py-2 text-right font-black text-sm md:text-base w-24 md:w-28">
                                  {formatCurrency(item.precoUnitario * item.quantidade)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {p.observacoes && (
                          <div className="mt-3 bg-yellow-50/50 border border-yellow-200 p-3 md:p-4 rounded-xl">
                            <p className="text-[10px] md:text-xs font-black text-yellow-800 uppercase mb-1 flex items-center gap-1.5">
                              <AlertTriangle size={14} /> Observações
                            </p>
                            <p className="text-xs md:text-sm font-bold text-yellow-900">{p.observacoes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 sm:p-4 border-t border-border bg-card shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-10">
                <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
                  <div>
                    <p className="text-[10px] md:text-xs font-black uppercase text-muted-foreground mb-0.5">
                      Total a Pagar
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-primary">
                      {formatCurrency(atendimentoAtual.total)}
                    </p>
                  </div>
                  <div className="flex gap-2 md:gap-3 w-full md:w-auto">
                    <button
                      onClick={() => imprimirConferencia(atendimentoAtual)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 md:py-3 text-[10px] md:text-xs font-black uppercase text-secondary-foreground hover:bg-secondary/80 transition-all shadow-sm"
                    >
                      <Printer size={18} /> Imprimir Conferência
                    </button>
                    <button
                      onClick={() => finalizarAtendimento(atendimentoAtual)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-5 md:px-6 py-2.5 md:py-3 text-[10px] md:text-xs font-black uppercase text-white hover:bg-green-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <CheckCircle2 size={18} /> Finalizar & Liberar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : telaAtiva === "config" ? (
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-3 sm:space-y-4">
              <div className="max-w-5xl mx-auto w-full">
                <div className="mb-3 md:mb-5 flex items-center justify-between">
                  <div>
                    <h1 className="text-lg sm:text-xl md:text-2xl font-black text-foreground">
                      Configurações
                    </h1>
                    <p className="text-[10px] sm:text-xs md:text-sm font-bold text-muted-foreground mt-1">
                      Gerencie o estoque e a segurança do sistema.
                    </p>
                  </div>
                  <button
                    onClick={() => setTelaAtiva("mesas")}
                    className="md:hidden h-8 w-8 flex items-center justify-center rounded-full bg-muted hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex gap-2 border-b border-border pb-3 mb-4 overflow-x-auto">
                  <button
                    onClick={() => setAbaConfig("estoque")}
                    className={`flex whitespace-nowrap items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all shadow-sm ${abaConfig === "estoque" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
                  >
                    <Store size={16} />
                    Estoque
                  </button>
                  <button
                    onClick={() => setAbaConfig("senhas")}
                    className={`flex whitespace-nowrap items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all shadow-sm ${abaConfig === "senhas" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
                  >
                    <Lock size={16} />
                    Senhas
                  </button>
                  <button
                    onClick={() => setAbaConfig("loja")}
                    className={`flex whitespace-nowrap items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all shadow-sm ${abaConfig === "loja" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
                  >
                    <Clock size={16} />
                    Loja
                  </button>
                </div>

                {abaConfig === "estoque" && (
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex gap-1.5 md:gap-2 mb-3 md:mb-4 flex-wrap">
                      {(["pizzas", "pasteis", "porcoes", "bebidas", "sucos"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setCategoriaConfig(t)}
                          className={`px-3 py-1.5 text-[10px] md:text-xs font-black rounded-lg capitalize transition-all ${categoriaConfig === t ? "bg-zinc-800 text-white shadow-md" : "bg-background border border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-2 gap-2 md:gap-3">
                      {itensMenuDaCategoria.map((i) => {
                        const esg = esgotados.includes(i.id);
                        return (
                          <div
                            key={i.id}
                            className="flex items-center justify-between border border-border bg-background p-2.5 md:p-3 rounded-xl transition-all hover:border-primary/40 shadow-sm"
                          >
                            <span className="text-xs md:text-sm font-black text-foreground">{i.name}</span>
                            <button
                              onClick={() => handleToggleEsgotado(i.id)}
                              className={`px-2.5 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${esg ? "bg-red-600 text-white shadow-sm" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                            >
                              {esg ? "⚠️ Esgotado" : "✓ Disponível"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {abaConfig === "senhas" && (
                  <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                      <label className="block text-[10px] md:text-xs font-black text-muted-foreground mb-1.5 md:mb-2 uppercase">
                        Nova Senha do Caixa (Números)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={inputPinCaixa}
                          onChange={(e) => setInputPinCaixa(e.target.value.replace(/\D/g, ""))}
                          className="h-9 md:h-10 flex-1 rounded-lg border border-border bg-background px-3 font-black text-sm md:text-base tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-center sm:text-left"
                        />
                        <button
                          onClick={() => handleSalvarSenha("caixa")}
                          className="h-9 md:h-10 rounded-lg bg-primary px-4 font-black text-[10px] md:text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                      <label className="block text-[10px] md:text-xs font-black text-muted-foreground mb-1.5 md:mb-2 uppercase">
                        Nova Senha Garçom (Números)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={inputPinGarcom}
                          onChange={(e) => setInputPinGarcom(e.target.value.replace(/\D/g, ""))}
                          className="h-9 md:h-10 flex-1 rounded-lg border border-border bg-background px-3 font-black text-sm md:text-base tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-center sm:text-left"
                        />
                        <button
                          onClick={() => handleSalvarSenha("garcom")}
                          className="h-9 md:h-10 rounded-lg bg-primary px-4 font-black text-[10px] md:text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {abaConfig === "loja" && (
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <label className="block text-[10px] md:text-xs font-black text-muted-foreground mb-1.5 md:mb-2 uppercase">
                      Horário e Dias de Funcionamento
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={horarioFuncionamento}
                        onChange={(e) => setHorarioFuncionamento(e.target.value)}
                        className="h-9 md:h-10 flex-1 rounded-lg border border-border bg-background px-3 font-bold text-xs md:text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-center sm:text-left"
                        placeholder="Ex: 🕒 Quarta a Domingo | das 18h às 22h."
                      />
                      <button
                        onClick={handleSalvarHorario}
                        className="h-9 md:h-10 rounded-lg bg-primary px-4 font-black text-[10px] md:text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-3 md:space-y-4">
              <div className="max-w-5xl mx-auto w-full">
                <div className="mb-3 md:mb-4 flex flex-row items-start md:items-center justify-between gap-2">
                  <div>
                    <h1 className="text-lg sm:text-xl md:text-2xl font-black text-foreground">
                      Painel Geral
                    </h1>
                    <p className="text-[10px] sm:text-xs md:text-sm font-bold text-muted-foreground mt-1">
                      Acompanhe as métricas e o histórico de pedidos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-muted-foreground justify-end mb-0.5">
                        <CalendarDays size={12} className="text-primary/70" />
                        <span className="capitalize">
                          {new Intl.DateTimeFormat("pt-BR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          }).format(horaAtual)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-black text-foreground text-lg md:text-xl justify-end">
                        <Clock size={16} className="text-primary" />
                        {horaAtual.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => setTelaAtiva("mesas")}
                      className="md:hidden h-8 w-8 flex items-center justify-center rounded-full bg-muted hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 md:p-4 shadow-sm mb-4">
                  <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-black uppercase text-foreground">
                    <Filter size={14} className="text-primary md:w-[16px] md:h-[16px]" /> Filtro de
                    Período:
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full xl:w-auto">
                    <div className="flex w-full xl:w-auto rounded-lg border border-border bg-background p-1 shadow-inner overflow-x-auto">
                      {(["hoje", "semana", "mes", "todos"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setFiltroTempo(p)}
                          className={`flex-1 min-w-[50px] xl:flex-none px-3 py-1.5 md:px-4 md:py-2 text-[10px] font-black uppercase rounded-md transition-all ${filtroTempo === p ? "bg-primary text-white shadow-md" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setMostrarCancelados(!mostrarCancelados)}
                      className={`flex w-full xl:w-auto justify-center items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[10px] font-black uppercase rounded-lg border shadow-sm transition-all ${mostrarCancelados ? "border-red-500 bg-red-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
                    >
                      <Ban size={12} className="md:w-3.5 md:h-3.5" />
                      {mostrarCancelados ? "Ocultar Cancelados" : "Ver Cancelados"}
                    </button>
                  </div>
                </div>

                {!mostrarCancelados && (
                  <div className="grid gap-2 sm:gap-3 md:grid-cols-3 mb-4">
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5 sm:mb-1">
                            Faturamento
                          </p>
                          <strong className="text-lg sm:text-xl font-black text-green-500">
                            {formatCurrency(statsPeriodo.faturamento)}
                          </strong>
                        </div>
                        <div className="bg-green-500/10 p-2 rounded-lg">
                          <DollarSign className="text-green-500 w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5 sm:mb-1">
                            Pedidos ({tituloDashboard})
                          </p>
                          <strong className="text-lg sm:text-xl font-black text-blue-500">
                            {statsPeriodo.qtdPedidos}
                          </strong>
                        </div>
                        <div className="bg-blue-500/10 p-2 rounded-lg">
                          <ShoppingBag className="text-blue-500 w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5 sm:mb-1">
                            Ticket Médio
                          </p>
                          <strong className="text-lg sm:text-xl font-black text-orange-500">
                            {formatCurrency(statsPeriodo.ticketMedio)}
                          </strong>
                        </div>
                        <div className="bg-orange-500/10 p-2 rounded-lg">
                          <TrendingUp className="text-orange-500 w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="border-b border-border bg-muted/30 px-3 sm:px-4 py-2.5 sm:py-3">
                    <h2 className="text-sm sm:text-base font-black text-foreground">
                      Histórico de Pedidos
                    </h2>
                  </div>
                  <div className="divide-y divide-border bg-card">
                    {pedidosFiltrados.length === 0 && (
                      <div className="p-6 sm:p-8 text-center text-xs sm:text-sm font-bold text-muted-foreground">
                        Nenhum pedido encontrado no período.
                      </div>
                    )}
                    {pedidosFiltrados.map((p) => (
                      <article
                        key={p.id}
                        className={`flex flex-col md:grid md:grid-cols-[1.5fr_1fr_auto] gap-3 px-3 sm:px-4 py-3 sm:py-4 items-start md:items-center transition hover:bg-muted/30 ${p.status === "cancelado" ? "opacity-60 bg-red-50/10 hover:bg-red-50/20" : ""}`}
                      >
                        <div>
                          <div className="mb-2 flex gap-2">
                            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-black uppercase text-secondary-foreground">
                              {p.origem}
                            </span>
                            {p.status === "cancelado" ? (
                              <span className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white">
                                Cancelado
                              </span>
                            ) : p.status === "finalizado" ? (
                              <span className="rounded-md bg-green-600 px-2 py-1 text-[10px] font-black uppercase text-white">
                                Finalizado
                              </span>
                            ) : (
                              <span
                                className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${p.impresso ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700 animate-pulse ring-1 ring-orange-300"}`}
                              >
                                {p.impresso ? "Aberto (Impresso)" : "Aberto (Pendente)"}
                              </span>
                            )}
                          </div>
                          <h3 className="font-black text-base sm:text-lg text-foreground">
                            {p.cliente?.nome ?? p.garcom ?? "Mesa"}
                          </h3>
                          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock size={12} /> {formatDateTime(p.data)}
                          </p>
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground space-y-1">
                          <p className="font-black text-foreground bg-muted/50 inline-block px-2 py-0.5 rounded-md">
                            {p.itens.length} item(ns)
                          </p>
                          <p className="flex items-center gap-1">
                            <DollarSign size={14} /> {p.pagamento}
                          </p>
                        </div>
                        <div className="w-full md:w-auto flex flex-row md:flex-col justify-between items-center md:items-end gap-2">
                          <div className="text-right">
                            <p className="text-xl sm:text-2xl font-black text-primary">
                              {formatCurrency(p.total)}
                            </p>
                          </div>
                          {p.status !== "cancelado" && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => imprimirPedido(p, true)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg bg-white border shadow-sm hover:bg-zinc-50 transition-colors"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                onClick={() => abrirModalEdicao(p)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setPedidoParaCancelar(p.id)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {alerta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl border border-border">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${alerta.tipo === "erro" ? "bg-red-100 text-red-600" : alerta.tipo === "sucesso" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}
            >
              {alerta.tipo === "erro" || alerta.tipo === "aviso" ? (
                <AlertTriangle size={36} />
              ) : (
                <CheckCircle2 size={36} />
              )}
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">{alerta.titulo}</h2>
            <p className="mb-6 font-semibold text-muted-foreground">{alerta.mensagem}</p>
            <button
              onClick={() => setAlerta(null)}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-primary/90"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {draftPedidoEdicao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border">
            <div className="mb-4 flex justify-between border-b pb-3">
              <h2 className="text-xl font-black">Editar Pedido</h2>
              <button
                onClick={() => setDraftPedidoEdicao(null)}
                className="p-2 bg-muted hover:bg-red-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            <ul className="space-y-3 mb-6">
              {draftPedidoEdicao.itens.map((item) => (
                <li key={item.key} className="rounded-xl border bg-background p-3 shadow-sm">
                  <div className="flex justify-between mb-3 border-b pb-2">
                    <div>
                      <p className="text-sm font-black">{item.nome}</p>
                    </div>
                    <button onClick={() => removerItemDraft(item.key)} className="text-destructive">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                      <button
                        onClick={() => alterarQtdItemDraft(item.key, -1)}
                        className="h-7 w-7 rounded bg-background font-black"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-black">{item.quantidade}</span>
                      <button
                        onClick={() => alterarQtdItemDraft(item.key, 1)}
                        className="h-7 w-7 rounded bg-background font-black"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong className="text-primary">
                      {formatCurrency(item.precoUnitario * item.quantidade)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={handleSalvarEdicaoItens}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-black uppercase text-white"
            >
              Salvar Edição
            </button>
          </div>
        </div>
      )}

      {pedidoParaCancelar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={36} />
            </div>
            <h2 className="mb-2 text-2xl font-black">Cancelar Pedido?</h2>
            <p className="font-semibold text-muted-foreground text-sm">
              Este pedido sairá do faturamento.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPedidoParaCancelar(null)}
                className="flex-1 rounded-xl border py-3 font-bold hover:bg-muted"
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
              >
                Sim, Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="cupom-impressao" aria-hidden={!pedidoParaImprimir}>
        {pedidoParaImprimir && (
          <>
            <div className="centro forte" style={{ fontSize: "14pt" }}>
              PIZZARIA 2 IRMÃOS
            </div>
            <div className="centro">Tel: (84) 99813-5262</div>
            <div className="divisor">================================</div>
            <div className="linha">
              <span>Pedido:</span>
              <span className="forte">#{pedidoParaImprimir.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="linha">
              <span>Data:</span>
              <span>{formatDateTime(pedidoParaImprimir.data)}</span>
            </div>
            <div className="linha">
              <span>Origem:</span>
              <span className="forte">{pedidoParaImprimir.origem}</span>
            </div>
            <div className="divisor">--------------------------------</div>
            <div className="forte">ITENS</div>
            {pedidoParaImprimir.itens.map((i) => (
              <div key={i.key} className="linha">
                <span>
                  {i.quantidade}x {i.nome}
                </span>
                <span>{formatCurrency(i.precoUnitario * i.quantidade)}</span>
              </div>
            ))}
            <div className="divisor">--------------------------------</div>
            <div className="linha forte" style={{ fontSize: "13pt" }}>
              <span>TOTAL:</span>
              <span>{formatCurrency(pedidoParaImprimir.total)}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
