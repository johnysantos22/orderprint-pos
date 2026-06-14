import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import axios from "axios";
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
  Smartphone,
  RefreshCw,
  QrCode,
  Package,
  Info,
} from "lucide-react";
import { PinLock } from "@/shared/components/PinLock";
import somCampainha from "@/assets/campainha.mp3";
import { collection, onSnapshot, query, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import logo from "@/assets/logo.jpeg";
import { pizzas, pasteis, porcoes, bebidas, sucos } from "@/domain/menu/menu";
import { formatCurrency, formatDateTime } from "@/shared/utils/format";

export function CashierDashboardPage() {
  const [pinCaixa, setPinCaixa] = useState<string | null>(() => localStorage.getItem("cachedPinCaixa"));

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "configuracoes", "seguranca"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().pinCaixa) {
        const pin = String(docSnap.data().pinCaixa);
        localStorage.setItem("cachedPinCaixa", pin);
        setPinCaixa(pin);
      } else {
        localStorage.setItem("cachedPinCaixa", "");
        setPinCaixa("");
      }
    });
    return () => unsubscribe();
  }, []);

  if (pinCaixa === null) {
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
  taxaServico?: number;
  total: number;
  impresso: boolean;
  impressoEm?: string;
  observacoes?: string;
  mesa?: string;
  garcom?: string;
  cliente?: { nome: string; endereco?: string; telefone?: string };
  tipoEntrega?: string;
  status?: string;
  telefone?: string;
}

interface ImprimirCupomOptions {
  tipoCupom?: "pedido" | "conferencia";
  rotuloPessoa?: "Cliente" | "Atendente";
  pessoa?: string;
  titulo?: string;
  origem?: string;
  mesa?: string;
}

function CaixaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
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
  const [abaConfig, setAbaConfig] = useState<"estoque" | "senhas" | "loja" | "whatsapp">("estoque");
  const [esgotados, setEsgotados] = useState<number[]>([]);
  const [menuOverrides, setMenuOverrides] = useState<Record<string, any>>({});
  const [itemEmEdicao, setItemEmEdicao] = useState<any | null>(null);
  const [precosEdit, setPrecosEdit] = useState<Record<string, string>>({});
  const [ingredientesEdit, setIngredientesEdit] = useState<string>("");
  const [inputPinCaixa, setInputPinCaixa] = useState("");
  const [inputPinGarcom, setInputPinGarcom] = useState("");
  const [horarioFuncionamento, setHorarioFuncionamento] = useState("🕒Quarta a Domingo | das 18h às 22h.");
  const [categoriaConfig, setCategoriaConfig] = useState<"pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos">("pizzas");

  const [horaAtual, setHoraAtual] = useState(new Date());

  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [carregandoQr, setCarregandoQr] = useState(false);

  const [alerta, setAlerta] = useState<{
    titulo: string;
    mensagem: string;
    tipo: "sucesso" | "erro" | "aviso";
  } | null>(null);

  const [mensagemFlutuante, setMensagemFlutuante] = useState("");
  const timeoutFlutuante = useRef<number | null>(null);

  const mostrarMensagemFlutuante = useCallback((msg: string) => {
    setMensagemFlutuante(msg);
    if (timeoutFlutuante.current) clearTimeout(timeoutFlutuante.current);
    timeoutFlutuante.current = window.setTimeout(() => setMensagemFlutuante(""), 2500);
  }, []);

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
          let mesaNormalizada = String(p.mesa).trim();
          if (/^\d+$/.test(mesaNormalizada)) {
            mesaNormalizada = parseInt(mesaNormalizada, 10).toString();
          }
          if (!mesas.has(mesaNormalizada)) mesas.set(mesaNormalizada, []);
          mesas.get(mesaNormalizada)!.push(p);
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

  // ==================================================================================
  // COMUNICAÇÃO 100% TELA PRETA - Sem CSS, Sem Html, Feito pro seu `printer.js`
  // ==================================================================================
  const imprimirCupom = useCallback(
    async (pedido: Pedido, opcoes: ImprimirCupomOptions = {}) => {
      const impressoraUrl = import.meta.env.VITE_IMPRESSORA_URL || "http://localhost:3001";
      const conferencia = opcoes.tipoCupom === "conferencia";

      const removerAcentos = (str: string) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      };

      const origemDoPedido = (opcoes.origem ?? pedido.origem ?? "").toUpperCase();
      const isAcrescimo = origemDoPedido.includes("ACRÉSCIMO") || origemDoPedido.includes("ACRESCIMO");
      const isCorrecao = origemDoPedido.includes("CORREÇÃO") || origemDoPedido.includes("CORRECAO") || origemDoPedido.includes("RETIRADA");

      // Identifica se é mesa/garçom para ocultar telefone e endereço
      const isInterno = !!pedido.mesa || origemDoPedido.includes("CONFERENCIA") || origemDoPedido.includes("MESA");

      let nomeParaImpressao = opcoes.pessoa || pedido.cliente?.nome || pedido.garcom || "Balcao";

      if (pedido.id.startsWith("CONF-")) {
        nomeParaImpressao = `CONFERENCIA - ${pedido.origem}`;
      } else if (pedido.mesa && !conferencia) {
        if (isAcrescimo) {
          nomeParaImpressao = `[ + ACRESCIMO ] MESA ${pedido.mesa} - ${nomeParaImpressao}`;
        } else if (isCorrecao) {
          nomeParaImpressao = `[ - RETIRADA ] MESA ${pedido.mesa} - ${nomeParaImpressao}`;
        } else {
          nomeParaImpressao = `MESA ${pedido.mesa} - ${nomeParaImpressao}`;
        }
      }

      // Montagem da variável "telefone" como o seu printer.js espera
      let dadosContato = "";

      if (!isInterno) {
        const telefoneReal = pedido.telefone || pedido.cliente?.telefone || "";
        if (telefoneReal.trim() !== "") {
          dadosContato += `${telefoneReal}\n`;
        }
        if (pedido.tipoEntrega === "ENTREGAR" && pedido.cliente?.endereco) {
          dadosContato += `Endereco de Entrega: ${pedido.cliente.endereco}\n`;
        }
      }

      if (pedido.pagamento) {
        dadosContato += `Pagamento: ${pedido.pagamento.toUpperCase()}`;
      }

      let observacoesParaImpressao = pedido.observacoes || "";

      if (isAcrescimo && !conferencia && !pedido.id.startsWith("CONF-")) {
        const aviso = `*** ATENCAO: ACRESCIMO DA MESA ${pedido.mesa} ***`;
        observacoesParaImpressao = observacoesParaImpressao ? `${aviso} | ${observacoesParaImpressao}` : aviso;
      } else if (isCorrecao && !conferencia && !pedido.id.startsWith("CONF-")) {
        const aviso = `*** ATENCAO: CORRECAO DA MESA ${pedido.mesa} ***`;
        observacoesParaImpressao = observacoesParaImpressao ? `${aviso} | ${observacoesParaImpressao}` : aviso;
      }

      try {
        setStatusImpressao(`Enviando para a Tela Preta...`);

        await axios.post(`${impressoraUrl}/imprimir`, {
          id: removerAcentos(pedido.id),
          data: pedido.data,
          origem: removerAcentos(origemDoPedido),
          cliente: removerAcentos(nomeParaImpressao),
          telefone: removerAcentos(dadosContato.trim()),
          total: pedido.total,
          taxaEntrega: isInterno ? 0 : (pedido.taxaEntrega || 0),
          itens: pedido.itens.map(item => ({
            quantidade: item.quantidade,
            nome: removerAcentos(item.nome),
            tamanho: item.tamanho ? removerAcentos(item.tamanho) : ""
          })),
          observacoes: removerAcentos(observacoesParaImpressao)
        }, { timeout: 8000 });

        setStatusImpressao(`Cupom impresso com sucesso!`);
      } catch (error) {
        console.warn("Falha na ponte local:", error);
        setStatusImpressao("Erro na comunicação com a impressora.");
        setAlerta({
          titulo: "Impressora Offline 🖨️",
          mensagem: "A tela preta não respondeu. Certifique-se de que o iniciar.bat está rodando.",
          tipo: "erro",
        });
        throw error;
      }
    },
    []
  );

  const imprimirPedido = useCallback(
    async (p: Pedido) => {
      try {
        await imprimirCupom(p);

        if (!p.impresso) {
          await updateDoc(doc(db, "pedidos", p.id), {
            impresso: true,
            impressoEm: new Date().toISOString(),
          });

          // Notificação de WhatsApp (Sem travar o sistema se der erro)
          let telefoneCliente = p.telefone || p.cliente?.telefone;
          if (telefoneCliente && !p.id.startsWith("CONF-")) {
            telefoneCliente = telefoneCliente.replace(/\D/g, '');
            if (telefoneCliente.length >= 10) {
              if (!telefoneCliente.startsWith('55')) telefoneCliente = '55' + telefoneCliente;

              const nomeCliente = p.cliente?.nome || "Cliente";
              const mensagem = `Olá, ${nomeCliente}!\n\nSeu pedido *#${p.id.slice(0, 6).toUpperCase()}* acabou de ser *recebido e impresso* na cozinha da *Pizzaria 2 Irmãos*! 🍕👨‍🍳\n\nLogo começaremos o preparo. Agradecemos a preferência!`;

              const whatsappUrl = import.meta.env.VITE_WHATSAPP_API_URL;
              const instancia = import.meta.env.VITE_WHATSAPP_INSTANCE_NAME;
              const apiKey = import.meta.env.VITE_WHATSAPP_API_KEY;

              const payload = {
                number: telefoneCliente,
                text: mensagem,
                options: { delay: 1200, presence: "composing" }
              };

              const configAxios = { headers: { "apikey": apiKey, "Content-Type": "application/json" } };
              axios.post(`${whatsappUrl}/message/sendText/${instancia}`, payload, configAxios).catch(() => { });
            }
          }
        }
        setPedidoComFalha(null);
      } catch (error) {
        setPedidoComFalha(p);
        throw error;
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
        const pendente = [...pedidosRef.current]
          .reverse()
          .find((p) => !p.impresso && p.status !== "cancelado");
        if (pendente) {
          try {
            await imprimirPedido(pendente);
          } catch (e) {
            temPendente = false; // Interrompe para proteger se a tela preta cair
          }
        } else {
          temPendente = false;
        }
      }
    } finally {
      imprimindoRef.current = false;
    }
  }, [imprimirPedido]);

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
      pagamento: "A DEFINIR NO CAIXA",
      itens: itensConsolidados,
      subtotal: atend.total,
      total: atend.total,
      impresso: true,
      observacoes: "*** CONFERENCIA DE MESA ***",
      cliente: { nome: "Balcao" }
    };
    await imprimirCupom(pedidoConferencia, { tipoCupom: "conferencia", pessoa: "Balcao" });
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
    const contagemItens: Record<string, { nome: string; quantidade: number; valorTotal: number }> = {};
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

        pedido.itens.forEach((item) => {
          const key = item.nome + (item.tamanho ? ` (${item.tamanho})` : '');
          if (!contagemItens[key]) {
            contagemItens[key] = { nome: key, quantidade: 0, valorTotal: 0 };
          }
          contagemItens[key].quantidade += item.quantidade;
          contagemItens[key].valorTotal += item.precoUnitario * item.quantidade;
        });
      }
    });

    const topItens = Object.values(contagemItens)
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);

    return { faturamento, qtdPedidos, ticketMedio: qtdPedidos > 0 ? faturamento / qtdPedidos : 0, topItens };
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

  useEffect(() => {
    const unsubPedidos = onSnapshot(query(collection(db, "pedidos")), (snap) => {
      const p: Pedido[] = [];
      snap.forEach((d) => p.push(d.data() as Pedido));
      const ord = p.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setPedidos(ord);
      pedidosRef.current = ord;
      processarPedidos(); // Chamada automática ao detectar pedido novo!
    });
    const unsubLoja = onSnapshot(doc(db, "configuracoes", "loja"), (snap) => {
      if (snap.exists()) {
        setLojaAberta(snap.data().aberta);
        if (snap.data().horarioFuncionamento)
          setHorarioFuncionamento(snap.data().horarioFuncionamento);
      }
    });
    const unsubCardapio = onSnapshot(doc(db, "configuracoes", "cardapio"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEsgotados(Array.isArray(data.esgotados) ? data.esgotados : []);
        setMenuOverrides(typeof data.overrides === 'object' && data.overrides !== null ? data.overrides : {});
      }
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
    try {
      await setDoc(doc(db, "configuracoes", "loja"), { aberta: novo }, { merge: true });
    } catch {
      setAlerta({
        titulo: "Erro",
        mensagem: "Erro de permissão no Firebase. Verifique as Regras.",
        tipo: "erro",
      });
    }
  };

  const handleToggleEsgotado = async (id: number) => {
    let nova = [...esgotados];
    if (nova.includes(id)) nova.splice(nova.indexOf(id), 1);
    else nova.push(id);
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
      mostrarMensagemFlutuante(`Senha do ${tipo === "caixa" ? "Caixa" : "Garçom"} alterada!`);
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
      mostrarMensagemFlutuante("Horário atualizado com sucesso!");
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

  const alterarStatusEAvisarCliente = async (pedido: Pedido, novoStatus: string) => {
    try {
      await updateDoc(doc(db, "pedidos", pedido.id), { status: novoStatus });

      let telefoneCliente = pedido.telefone || pedido.cliente?.telefone;
      if (!telefoneCliente) {
        setAlerta({ titulo: "Aviso", mensagem: "Pedido sem telefone cadastrado.", tipo: "aviso" });
        return;
      }

      telefoneCliente = telefoneCliente.replace(/\D/g, '');
      if (!telefoneCliente.startsWith('55')) telefoneCliente = '55' + telefoneCliente;

      let mensagem = "";
      const nomeCliente = pedido.cliente?.nome || "Cliente";

      switch (novoStatus) {
        case "em_preparo":
          mensagem = `Olá, ${nomeCliente}! Tudo bem?\n\nSeu pedido na *Pizzaria 2 Irmãos* já está *em preparo* 🍕.\nLogo ele estará pronto!`;
          break;
        case "em_rota":
          mensagem = `Olá, ${nomeCliente}!\n\nÓtima notícia: seu pedido acabou de *sair para entrega* 🛵.\nPrepare-se, em breve ele chegará até você!`;
          break;
        case "pronto":
          mensagem = `Olá, ${nomeCliente}!\n\nSeu pedido já está *pronto para retirada* 🛍️.\nEstamos te aguardando na pizzaria!`;
          break;
        default:
          mensagem = `Olá, ${nomeCliente}!\n\nO status do seu pedido na *Pizzaria 2 Irmãos* foi atualizado para: *${novoStatus}*.`;
          break;
      }

      const whatsappUrl = import.meta.env.VITE_WHATSAPP_API_URL;
      const instancia = import.meta.env.VITE_WHATSAPP_INSTANCE_NAME;
      const apiKey = import.meta.env.VITE_WHATSAPP_API_KEY;

      const payload = {
        number: telefoneCliente,
        text: mensagem,
        options: { delay: 1200, presence: "composing" }
      };

      const configAxios = {
        headers: {
          "apikey": apiKey,
          "Content-Type": "application/json"
        }
      };

      try {
        await axios.post(`${whatsappUrl}/message/sendText/${instancia}`, payload, configAxios);
        setAlerta({ titulo: "Sucesso", mensagem: "Cliente Notificado!", tipo: "sucesso" });
      } catch (erroPrimeira) {
        console.warn("Falha na sincronização. Aguardando 2s...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          await axios.post(`${whatsappUrl}/message/sendText/${instancia}`, payload, configAxios);
          setAlerta({ titulo: "Sucesso", mensagem: "Cliente Notificado!", tipo: "sucesso" });
        } catch (erroSegunda: any) {
          setAlerta({
            titulo: "Erro WhatsApp",
            mensagem: erroSegunda.response?.data?.message || "Não foi possível notificar o cliente.",
            tipo: "erro"
          });
        }
      }

    } catch (error: any) {
      console.error("ERRO NO BANCO OU CONFIGURAÇÃO:", error);
      setAlerta({
        titulo: "Erro de Sistema",
        mensagem: "Erro ao atualizar o status do pedido.",
        tipo: "erro"
      });
    }
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
      mostrarMensagemFlutuante("Pedido atualizado com sucesso!");
    } catch {
      setAlerta({ titulo: "Erro", mensagem: "Erro ao atualizar o pedido.", tipo: "erro" });
    }
  };

  const buscarQrCodeWhatsApp = async () => {
    setCarregandoQr(true);
    setQrCodeBase64(null);

    const whatsappUrl = import.meta.env.VITE_WHATSAPP_API_URL?.replace(/\/$/, "");
    const instancia = import.meta.env.VITE_WHATSAPP_INSTANCE_NAME;
    const apiKey = import.meta.env.VITE_WHATSAPP_API_KEY;

    if (!whatsappUrl || !instancia || !apiKey) {
      setAlerta({
        titulo: "Erro de Configuração",
        mensagem: "As variáveis do WhatsApp não estão configuradas no arquivo .env.",
        tipo: "erro"
      });
      setCarregandoQr(false);
      return;
    }

    const config = { headers: { "apikey": apiKey, "Content-Type": "application/json" } };

    try {
      await axios.delete(`${whatsappUrl}/instance/logout/${instancia}`, config).catch(() => { });
      await new Promise(resolve => setTimeout(resolve, 2000));

      let qrEncontrado = false;

      for (let i = 0; i < 4; i++) {
        const response = await axios.get(`${whatsappUrl}/instance/connect/${instancia}`, config);
        const base64 = response.data?.base64 || response.data?.qrcode?.base64 || response.data?.qrcode;

        if (base64 && typeof base64 === 'string' && base64.trim() !== "") {
          const imagemPronta = base64.includes("data:image") ? base64 : `data:image/png;base64,${base64}`;
          setQrCodeBase64(imagemPronta);
          qrEncontrado = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!qrEncontrado) {
        throw new Error("A API demorou muito para gerar o QR Code.");
      }

    } catch (error: any) {
      setAlerta({
        titulo: "Falha de Conexão",
        mensagem: "Não foi possível gerar o QR Code. Verifique se o Motor do WhatsApp está rodando e se a instância existe.",
        tipo: "erro"
      });
    } finally {
      setCarregandoQr(false);
    }
  };

  const abrirModalEdicaoItem = (item: any) => {
    const override = menuOverrides[String(item.id)] || {};
    const basePriceObj = item.prices || item.precos || {};
    const initialPrices: Record<string, string> = {};

    if (Object.keys(basePriceObj).length > 0) {
      Object.keys(basePriceObj).forEach((k) => {
        initialPrices[k] = override.prices?.[k] !== undefined ? String(override.prices[k]) : String(basePriceObj[k]);
      });
    } else {
      initialPrices['default'] = override.preco !== undefined ? String(override.preco) : String(item.price || item.preco || 0);
    }

    setPrecosEdit(initialPrices);
    setIngredientesEdit(override.ingredientes !== undefined ? override.ingredientes : (item.description || item.descricao || item.ingredientes || ""));
    setItemEmEdicao(item);
  };

  const handleSalvarEdicaoItemCardapio = async () => {
    if (!itemEmEdicao) return;
    try {
      const itemAtual = itemEmEdicao;
      setItemEmEdicao(null);
      mostrarMensagemFlutuante(`${itemAtual.name} atualizado!`);

      const novosOverrides = { ...menuOverrides };
      const overrideAtual = { ...(novosOverrides[String(itemAtual.id)] || {}) };
      overrideAtual.ingredientes = ingredientesEdit;

      if (Object.keys(precosEdit).length > 1 || precosEdit['P'] || precosEdit['M'] || itemAtual.prices || itemAtual.precos) {
        overrideAtual.prices = {};
        Object.keys(precosEdit).forEach((k) => { overrideAtual.prices[k] = parseFloat(precosEdit[k].replace(',', '.')); });
      } else {
        overrideAtual.preco = parseFloat(precosEdit['default'].replace(',', '.'));
      }
      novosOverrides[String(itemAtual.id)] = overrideAtual;

      await setDoc(doc(db, "configuracoes", "cardapio"), { overrides: novosOverrides }, { merge: true });
    } catch {
      setAlerta({ titulo: "Erro", mensagem: "Não foi possível salvar a alteração.", tipo: "erro" });
    }
  };

  const itensMenuDaCategoria = useMemo<any[]>(() => {
    if (categoriaConfig === "pizzas") return pizzas;
    if (categoriaConfig === "pasteis") return pasteis;
    if (categoriaConfig === "porcoes") return porcoes;
    if (categoriaConfig === "bebidas") return bebidas;
    return sucos;
  }, [categoriaConfig]);

  return (
    <>
      <div className="flex h-screen w-full bg-background overflow-hidden">
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
                    {a.pedidos.reduce((total, p) => total + p.itens.reduce((sum, item) => sum + item.quantidade, 0), 0)} itens
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
                            {atendimentoAtual.tipo === "mesa" ? "Lançamento" : "Pedido"} #{p.id.slice(0, 6).toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] md:text-xs font-black uppercase px-2 py-1 rounded-md ${p.status === "em_preparo"
                              ? "bg-yellow-100 text-yellow-700"
                              : p.status === "em_rota"
                                ? "bg-blue-100 text-blue-700"
                                : p.status === "pronto"
                                  ? "bg-green-100 text-green-700"
                                  : p.impresso
                                    ? "bg-cyan-100 text-cyan-800"
                                    : "bg-orange-100 text-orange-700 animate-pulse ring-1 ring-orange-300"
                              }`}
                          >
                            {p.status === "em_preparo" ? "🍕 Em Preparo" :
                              p.status === "em_rota" ? "🛵 Em Rota" :
                                p.status === "pronto" ? "🛍️ Pronto" :
                                  p.impresso ? "✅ Recebido" : "⏳ Aguardando"}
                          </span>
                        </div>
                        <div className="flex gap-1.5 md:gap-2">
                          <button
                            onClick={() => imprimirPedido(p)}
                            className="h-8 w-8 md:h-9 md:w-9 flex items-center justify-center rounded-lg bg-white border shadow-sm hover:bg-zinc-50"
                            title="Reimprimir Pedido"
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
                        {p.taxaEntrega ? (
                          <div className="mt-1 flex justify-between items-center text-sm font-bold text-muted-foreground border-t border-border/50 pt-2">
                            <span>Taxa de Entrega:</span>
                            <span>{formatCurrency(p.taxaEntrega)}</span>
                          </div>
                        ) : null}
                        {p.observacoes && (
                          <div className="mt-3 bg-yellow-50/50 border border-yellow-200 p-3 md:p-4 rounded-xl">
                            <p className="text-[10px] md:text-xs font-black text-yellow-800 uppercase mb-1 flex items-center gap-1.5">
                              <AlertTriangle size={14} /> Observações
                            </p>
                            <p className="text-xs md:text-sm font-bold text-yellow-900">{p.observacoes}</p>
                          </div>
                        )}

                        {p.tipoEntrega && p.tipoEntrega !== "NO_LOCAL" && (
                          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
                            {(!p.status || p.status === "pendente") && (
                              <button
                                onClick={() => alterarStatusEAvisarCliente(p, "em_preparo")}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs md:text-sm font-black uppercase transition-colors shadow-sm"
                              >
                                🍕 Iniciar Preparo
                              </button>
                            )}

                            {p.status === "em_preparo" && p.tipoEntrega === "ENTREGAR" && (
                              <button
                                onClick={() => alterarStatusEAvisarCliente(p, "em_rota")}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs md:text-sm font-black uppercase transition-colors shadow-sm"
                              >
                                🛵 Saiu p/ Entrega
                              </button>
                            )}

                            {p.status === "em_preparo" && p.tipoEntrega === "RETIRAR" && (
                              <button
                                onClick={() => alterarStatusEAvisarCliente(p, "pronto")}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs md:text-sm font-black uppercase transition-colors shadow-sm"
                              >
                                🛍️ Pronto p/ Retirar
                              </button>
                            )}
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
                      Gerencie o estoque, a segurança e a comunicação do sistema.
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
                    <Package size={16} />
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
                  <button
                    onClick={() => {
                      setAbaConfig("whatsapp");
                      buscarQrCodeWhatsApp();
                    }}
                    className={`flex whitespace-nowrap items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all shadow-sm ${abaConfig === "whatsapp" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
                  >
                    <Smartphone size={16} />
                    WhatsApp
                  </button>
                </div>

                {abaConfig === "estoque" && (
                  <div className="bg-card border border-border rounded-xl shadow-sm mt-4 mx-auto max-w-6xl overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      <div className="w-full md:w-64 lg:w-72 bg-muted/30 border-b md:border-b-0 md:border-r border-border p-5 sm:p-6 flex flex-col gap-6">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
                              <Package size={24} />
                            </div>
                            <h3 className="text-xl font-black text-foreground">Estoque</h3>
                          </div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Desative itens esgotados em tempo real.
                          </p>

                          <div className="mt-4 bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                            <h4 className="flex items-center gap-2 text-blue-800 font-bold text-sm mb-2">
                              <Info size={16} /> Como usar o Estoque
                            </h4>
                            <ul className="text-xs text-blue-700/80 space-y-1.5 list-disc pl-4">
                              <li>Escolha a categoria desejada no menu abaixo.</li>
                              <li>Clique em <strong>"Pausar Item"</strong> para marcar um produto como esgotado.</li>
                              <li>Itens pausados não poderão ser pedidos pelos clientes ou garçons.</li>
                              <li>Para voltar a vender, clique em <strong>"Reativar Item"</strong>.</li>
                            </ul>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-3 px-1">Categorias</h4>
                          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide">
                            {(["pizzas", "pasteis", "porcoes", "bebidas", "sucos"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => setCategoriaConfig(t)}
                                className={`flex-shrink-0 md:w-full flex items-center justify-between px-4 py-3 text-xs md:text-sm font-black rounded-xl capitalize transition-all shadow-sm border ${categoriaConfig === t ? "bg-primary border-primary text-white shadow-md" : "bg-card border-border text-muted-foreground hover:bg-muted hover:border-primary/30"}`}
                              >
                                {t}
                                {categoriaConfig === t && <CheckCircle2 size={16} className="hidden md:block" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 p-5 sm:p-6 bg-background flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-base sm:text-lg font-black uppercase text-foreground capitalize flex items-center gap-2">
                            {categoriaConfig}
                          </h4>
                          <span className="text-[10px] sm:text-xs font-black text-muted-foreground bg-muted px-3 py-1.5 rounded-lg border border-border">
                            {itensMenuDaCategoria.length} ITENS
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 max-h-[500px] xl:max-h-[600px] overflow-y-auto pr-1">
                          {itensMenuDaCategoria.map((i) => {
                            const esg = esgotados.includes(i.id);
                            const override = menuOverrides[String(i.id)] || {};
                            const descricaoItem = override.ingredientes !== undefined ? override.ingredientes : (i.description || i.descricao || i.ingredientes);
                            return (
                              <div
                                key={i.id}
                                className={`relative flex flex-col justify-between p-4 rounded-xl border-2 transition-colors duration-200 shadow-sm ${esg ? "bg-red-50/50 border-red-200" : "bg-card border-border hover:border-primary/40"}`}
                              >
                                {esg && (
                                  <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                                    <Ban size={10} /> Esgotado
                                  </div>
                                )}
                                <div className="mb-4 pr-20">
                                  <h5 className={`font-black text-sm md:text-base leading-tight ${esg ? 'text-red-900/60 line-through decoration-red-500/40' : 'text-foreground'}`}>
                                    {i.name}
                                  </h5>
                                  {descricaoItem && (
                                    <p className="text-[10px] font-semibold text-muted-foreground mt-1 line-clamp-2 text-ellipsis overflow-hidden">
                                      {descricaoItem}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleToggleEsgotado(i.id)}
                                  className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[10px] md:text-xs font-black uppercase rounded-lg transition-colors ${esg ? "bg-red-100 text-red-700 hover:bg-red-200 shadow-sm" : "bg-muted/50 text-foreground hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20"}`}
                                >
                                  {esg ? (
                                    <><CheckCircle2 size={14} /> Reativar Item</>
                                  ) : (
                                    <><Ban size={14} /> Pausar Item</>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {abaConfig === "senhas" && (
                  <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8 mt-4 mx-auto max-w-4xl">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                      <div className="flex-1 space-y-6 w-full md:max-w-sm">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                              <Lock size={24} />
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-foreground">Controle de Acesso</h3>
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">
                            Defina os códigos PIN numéricos para restringir e proteger o acesso às áreas operacionais do sistema.
                          </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-xs font-semibold flex gap-3 items-start shadow-sm">
                          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                          <p>
                            Recomendamos criar senhas diferentes para o Caixa e para os Garçons. Senhas fáceis (como 1234) podem comprometer a segurança da loja.
                          </p>
                        </div>

                        <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl">
                          <h4 className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                            <Info size={16} /> Como gerenciar acessos
                          </h4>
                          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                            <li><strong>Senha do Caixa:</strong> Bloqueia a visualização deste painel completo, relatórios e configurações.</li>
                            <li><strong>Senha da Equipe:</strong> Exigida para que os garçons abram e adicionem itens nas comandas das mesas.</li>
                            <li>Digite o novo PIN (mínimo 4 números) e clique em "Salvar" para atualizar imediatamente.</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-4">
                        <div className="bg-muted/30 border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/40 transition-colors">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="bg-background border border-border p-2 rounded-lg shadow-sm">
                              <Store size={18} className="text-foreground" />
                            </div>
                            <div>
                              <h4 className="font-black text-sm uppercase text-foreground">Senha do Caixa</h4>
                              <p className="text-[10px] font-semibold text-muted-foreground">Acesso total ao Painel PDV</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="text"
                                maxLength={6}
                                value={inputPinCaixa}
                                onChange={(e) => setInputPinCaixa(e.target.value.replace(/\D/g, ""))}
                                placeholder="PIN"
                                className="h-12 w-full rounded-xl border border-border bg-background pl-9 pr-4 font-black text-lg tracking-[0.25em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                              />
                            </div>
                            <button
                              onClick={() => handleSalvarSenha("caixa")}
                              className="h-12 px-6 rounded-xl bg-primary font-black text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all flex items-center justify-center"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>

                        <div className="bg-muted/30 border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/40 transition-colors">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="bg-background border border-border p-2 rounded-lg shadow-sm">
                              <Smartphone size={18} className="text-foreground" />
                            </div>
                            <div>
                              <h4 className="font-black text-sm uppercase text-foreground">Senha da Equipe</h4>
                              <p className="text-[10px] font-semibold text-muted-foreground">Acesso à Comanda no Salão</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="text"
                                maxLength={6}
                                value={inputPinGarcom}
                                onChange={(e) => setInputPinGarcom(e.target.value.replace(/\D/g, ""))}
                                placeholder="PIN"
                                className="h-12 w-full rounded-xl border border-border bg-background pl-9 pr-4 font-black text-lg tracking-[0.25em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                              />
                            </div>
                            <button
                              onClick={() => handleSalvarSenha("garcom")}
                              className="h-12 px-6 rounded-xl bg-primary font-black text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all flex items-center justify-center"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {abaConfig === "loja" && (
                  <div className="space-y-6 mx-auto max-w-4xl mt-4 pb-10">
                    <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
                      <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="flex-1 space-y-6 w-full md:max-w-sm">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <div className="bg-purple-100 p-2.5 rounded-xl text-purple-600">
                                <Clock size={24} />
                              </div>
                              <h3 className="text-xl sm:text-2xl font-black text-foreground">Horário da Loja</h3>
                            </div>
                            <p className="text-sm font-semibold text-muted-foreground">
                              Configure o texto do horário de funcionamento que será exibido aos clientes no catálogo digital e neste painel.
                            </p>
                          </div>

                          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800 text-xs font-semibold flex gap-3 items-start shadow-sm">
                            <Store size={18} className="shrink-0 mt-0.5" />
                            <p>
                              O botão de "Aberta/Fechada" do painel lateral no PDV é que determina se o sistema aceita pedidos. Este texto aqui serve apenas para informação visual ao cliente.
                            </p>
                          </div>

                          <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-xl">
                            <h4 className="flex items-center gap-2 text-purple-800 font-bold text-sm mb-2">
                              <Info size={16} /> Instruções de Uso
                            </h4>
                            <ul className="text-xs text-purple-700/80 space-y-1.5 list-disc pl-4">
                              <li>Este texto aparecerá de forma destacada no catálogo online.</li>
                              <li>Preencha com o expediente atual, ex: <strong>"Terça a Domingo | 18h às 23:30"</strong>.</li>
                              <li>Clique em "Salvar Horário" para aplicar a mudança instantaneamente.</li>
                            </ul>
                          </div>
                        </div>

                        <div className="flex-1 w-full space-y-4">
                          <div className="bg-muted/30 border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/40 transition-colors">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-background border border-border p-2 rounded-lg shadow-sm">
                                <CalendarDays size={18} className="text-foreground" />
                              </div>
                              <div>
                                <h4 className="font-black text-sm uppercase text-foreground">Dias e Horários</h4>
                                <p className="text-[10px] font-semibold text-muted-foreground">Texto em formato livre</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <div className="relative">
                                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  type="text"
                                  value={horarioFuncionamento}
                                  onChange={(e) => setHorarioFuncionamento(e.target.value)}
                                  placeholder="Ex: 🕒 Quarta a Domingo | das 18h às 22h."
                                  className="h-12 w-full rounded-xl border border-border bg-background pl-9 pr-4 font-bold text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                                />
                              </div>
                              <button
                                onClick={handleSalvarHorario}
                                className="h-12 w-full rounded-xl bg-primary font-black text-xs uppercase text-white hover:bg-primary/90 shadow-md transition-all flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 size={18} /> Salvar Horário
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
                      <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="flex-1 space-y-6 w-full md:max-w-sm">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
                              <Edit3 size={24} />
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-foreground">Edição de Cardápio</h3>
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">
                            Altere preços e a descrição/ingredientes dos produtos. As atualizações refletem imediatamente no catálogo do cliente e no app do garçom.
                          </p>
                        </div>

                        <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl">
                          <h4 className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-2">
                            <Info size={16} /> Como editar o Cardápio
                          </h4>
                          <ul className="text-xs text-emerald-700/80 space-y-1.5 list-disc pl-4">
                            <li>Navegue pelas categorias (Pizzas, Bebidas, etc.) à direita.</li>
                            <li>Clique em <strong>"Editar"</strong> no produto desejado.</li>
                            <li>Atualize o valor ou a descrição e salve. Todos os menus conectados serão atualizados na hora.</li>
                          </ul>
                        </div>

                        <div className="flex-1 w-full bg-muted/30 border border-border rounded-xl p-5">
                          <div className="flex gap-2 overflow-x-auto pb-3 mb-3 border-b border-border scrollbar-hide">
                            {(["pizzas", "pasteis", "porcoes", "bebidas", "sucos"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => setCategoriaConfig(t)}
                                className={`flex-shrink-0 px-4 py-2 text-xs font-black rounded-lg capitalize transition-all border ${categoriaConfig === t ? "bg-primary border-primary text-white shadow-sm" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <div className="max-h-[350px] overflow-y-auto space-y-2 pr-2">
                            {itensMenuDaCategoria.map(item => {
                              const override = menuOverrides[String(item.id)] || {};
                              return (
                                <div key={item.id} className="flex justify-between items-center p-3 bg-card border border-border rounded-xl hover:border-primary/40 transition-colors shadow-sm">
                                  <div className="flex-1 pr-3">
                                    <p className="text-sm font-black text-foreground break-words">
                                      {item.name}
                                    </p>
                                    <p className="text-[10px] font-semibold text-muted-foreground line-clamp-1 mt-0.5 break-words">
                                      {override.ingredientes !== undefined ? override.ingredientes : (item.description || item.descricao || item.ingredientes || "Sem descrição")}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => abrirModalEdicaoItem(item)}
                                    className="h-8 px-3 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-xs font-black uppercase hover:bg-blue-100 shrink-0 transition-colors"
                                  >
                                    Editar
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {abaConfig === "whatsapp" && (
                  <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-6 md:p-8 mt-4 mx-auto max-w-4xl">
                    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start">
                      <div className="flex-1 space-y-4 md:space-y-6 w-full">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="bg-green-100 p-2.5 rounded-xl text-green-600">
                            <Smartphone size={24} />
                          </div>
                          <h3 className="text-xl sm:text-2xl font-black text-foreground">Integração WhatsApp</h3>
                        </div>

                        <button
                          onClick={buscarQrCodeWhatsApp}
                          disabled={carregandoQr}
                          className="w-full md:w-auto px-6 h-12 rounded-xl bg-green-600 font-black text-sm uppercase text-white hover:bg-green-700 shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {carregandoQr ? (
                            <><RefreshCw size={18} className="animate-spin" /> Aguarde...</>
                          ) : qrCodeBase64 ? (
                            <><RefreshCw size={18} /> Atualizar QR Code</>
                          ) : (
                            <><QrCode size={18} /> Gerar QR Code</>
                          )}
                        </button>

                        <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl mt-6">
                          <h4 className="flex items-center gap-2 text-green-800 font-bold text-sm mb-2">
                            <Info size={16} /> Status: Aparelho Conectado
                          </h4>
                          <ul className="text-xs text-green-700/80 space-y-1.5 list-disc pl-4">
                            <li>O seu celular já está configurado como o WhatsApp oficial da pizzaria.</li>
                            <li>Notificações automáticas de status ("Em preparo", "Saiu para entrega") são enviadas por ele.</li>
                            <li>Caso os clientes parem de receber mensagens, use os botões acima para gerar um novo QR Code e reconectar.</li>
                            <li>Dica: Mantenha o celular conectado à internet para evitar atrasos nos envios.</li>
                          </ul>
                        </div>
                      </div>

                      <div className="w-full md:w-[320px] flex flex-col items-center">
                        <div className="w-full bg-muted/20 border-2 border-dashed border-border rounded-2xl p-4 sm:p-6 min-h-[280px] flex flex-col items-center justify-center relative overflow-hidden">
                          {carregandoQr ? (
                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                              <p className="text-xs font-black uppercase text-muted-foreground animate-pulse">Solicitando acesso...</p>
                            </div>
                          ) : qrCodeBase64 ? (
                            <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xl ring-1 ring-border relative z-10 w-full flex justify-center">
                              <img src={qrCodeBase64} alt="QR Code WhatsApp" className="w-full max-w-[200px] md:max-w-[240px] h-auto object-contain" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-center opacity-40 grayscale">
                              <QrCode size={64} className="mb-4 text-muted-foreground" />
                              <p className="text-xs font-black uppercase text-muted-foreground">Aguardando geração<br />do código</p>
                            </div>
                          )}
                        </div>
                      </div>
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
                    <Filter size={14} className="text-primary" /> Filtros:
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
                      <Ban size={12} />
                      {mostrarCancelados ? "Ocultar Cancelados" : "Ver Cancelados"}
                    </button>
                  </div>
                </div>

                {!mostrarCancelados && (
                  <div className="grid gap-2 sm:gap-3 md:grid-cols-3 mb-4">
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5">Faturamento</p>
                          <strong className="text-lg sm:text-xl font-black text-green-500">{formatCurrency(statsPeriodo.faturamento)}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5">Pedidos</p>
                          <strong className="text-lg sm:text-xl font-black text-blue-500">{statsPeriodo.qtdPedidos}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground mb-0.5">Ticket Médio</p>
                          <strong className="text-lg sm:text-xl font-black text-orange-500">{formatCurrency(statsPeriodo.ticketMedio)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!mostrarCancelados && statsPeriodo.topItens.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm mb-4">
                    <h3 className="text-[10px] md:text-xs font-black uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-primary" />
                      Top 5 Mais Vendidos ({tituloDashboard})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {statsPeriodo.topItens.map((item, index) => (
                        <div key={item.nome} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 shadow-sm hover:border-primary/30 transition-colors">
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-black text-sm shrink-0">
                            {index + 1}º
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-bold text-foreground truncate" title={item.nome}>{item.nome}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">{item.quantidade}x saídas <span className="opacity-40 px-1">•</span> {formatCurrency(item.valorTotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="divide-y divide-border bg-card">
                    {pedidosFiltrados.length === 0 && (
                      <div className="p-6 sm:p-8 text-center text-xs sm:text-sm font-bold text-muted-foreground">
                        Nenhum registro encontrado.
                      </div>
                    )}
                    {pedidosFiltrados.map((p) => (
                      <article
                        key={p.id}
                        className={`flex flex-col md:grid md:grid-cols-[1.5fr_1fr_auto] gap-3 px-3 sm:px-4 py-3 sm:py-4 items-start md:items-center transition hover:bg-muted/30 ${p.status === "cancelado" ? "opacity-60 bg-red-50/10 hover:bg-red-50/20" : ""}`}
                      >
                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-black uppercase text-secondary-foreground">
                              {p.origem}
                            </span>
                            <span className="rounded-md border border-border px-2 py-1 text-[10px] font-black uppercase text-muted-foreground shadow-sm">
                              #{p.id.slice(0, 6).toUpperCase()}
                            </span>
                            {p.status === "cancelado" ? (
                              <span className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white shadow-sm">Cancelado</span>
                            ) : p.status === "finalizado" ? (
                              <span className="rounded-md bg-green-600 px-2 py-1 text-[10px] font-black uppercase text-white shadow-sm">Finalizado</span>
                            ) : (
                              <span
                                className={`rounded-md px-2 py-1 text-[10px] font-black uppercase shadow-sm ${p.status === "em_preparo"
                                  ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                  : p.status === "em_rota"
                                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                                    : p.status === "pronto"
                                      ? "bg-green-100 text-green-700 border border-green-200"
                                      : p.impresso
                                        ? "bg-cyan-100 text-cyan-800 border border-cyan-200"
                                        : "bg-orange-100 text-orange-700 animate-pulse ring-1 ring-orange-300"
                                  }`}
                              >
                                {p.status === "em_preparo" ? "🍕 Em Preparo" : p.status === "em_rota" ? "🛵 Em Rota" : p.status === "pronto" ? "🛍️ Pronto" : p.impresso ? "✅ Recebido" : "⏳ Pendente"}
                              </span>
                            )}
                          </div>
                          <h3 className="font-black text-base sm:text-lg text-foreground break-all">
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
                        </div>
                        <div className="w-full md:w-auto flex flex-row md:flex-col justify-between items-center md:items-end gap-2">
                          <p className="text-xl sm:text-2xl font-black text-primary">{formatCurrency(p.total)}</p>
                          {p.status !== "cancelado" && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => imprimirPedido(p)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg bg-white border shadow-sm hover:bg-zinc-50"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                onClick={() => abrirModalEdicao(p)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setPedidoParaCancelar(p.id)}
                                className="h-8 w-8 md:h-9 md:w-9 flex justify-center items-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
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

      {draftPedidoEdicao && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-2xl border border-border max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-foreground">
                Editar Pedido #{draftPedidoEdicao.id.slice(0, 6).toUpperCase()}
              </h2>
              <button
                onClick={() => setDraftPedidoEdicao(null)}
                className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {draftPedidoEdicao.itens.length === 0 ? (
                <p className="text-center text-muted-foreground font-semibold py-4">
                  Nenhum item neste pedido.
                </p>
              ) : (
                draftPedidoEdicao.itens.map((item) => (
                  <div key={item.key} className="flex justify-between items-center bg-muted/30 p-3 rounded-xl border border-border">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">
                        {item.nome} {item.tamanho ? `(${item.tamanho})` : ""}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {formatCurrency(item.precoUnitario)} cada
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-1">
                        <button
                          onClick={() => alterarQtdItemDraft(item.key, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-muted text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-black text-sm w-4 text-center">{item.quantidade}</span>
                        <button
                          onClick={() => alterarQtdItemDraft(item.key, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-muted text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => removerItemDraft(item.key)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-muted-foreground">Novo Total:</span>
                <span className="text-xl font-black text-primary">{formatCurrency(draftPedidoEdicao.total)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDraftPedidoEdicao(null)}
                  className="flex-1 rounded-xl bg-muted py-3 text-sm font-bold text-foreground hover:bg-muted/80 transition-colors shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarEdicaoItens}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {itemEmEdicao && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border">
            <h2 className="text-xl font-black text-foreground mb-4">Editar {itemEmEdicao.name}</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                  Descrição / Ingredientes
                </label>
                <textarea
                  value={ingredientesEdit}
                  onChange={(e) => setIngredientesEdit(e.target.value)}
                  className="w-full min-h-[80px] rounded-xl border border-border bg-background p-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  placeholder="Ex: Molho, mussarela, orégano..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                  Preço(s)
                </label>
                <div className="space-y-2">
                  {Object.keys(precosEdit).map((tamanho) => (
                    <div key={tamanho} className="flex items-center gap-3">
                      {tamanho !== 'default' && (
                        <span className="w-10 text-sm font-black text-foreground uppercase text-center bg-muted py-2 rounded-lg">
                          {tamanho}
                        </span>
                      )}
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">R$</span>
                        <input
                          type="text"
                          value={precosEdit[tamanho]}
                          onChange={(e) => setPrecosEdit({ ...precosEdit, [tamanho]: e.target.value.replace(/[^0-9.,]/g, "") })}
                          className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 font-bold text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setItemEmEdicao(null)}
                className="flex-1 rounded-xl bg-muted py-3 text-sm font-bold text-foreground hover:bg-muted/80 transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarEdicaoItemCardapio}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {pedidoParaCancelar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl border border-border">
            <div className="mx-auto w-16 h-16 bg-red-100 text-red-600 flex items-center justify-center rounded-full mb-4">
              <Trash2 size={32} />
            </div>
            <h2 className="mb-2 text-xl font-black text-foreground">Cancelar Pedido?</h2>
            <p className="mb-6 font-semibold text-muted-foreground text-sm">
              Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPedidoParaCancelar(null)} className="flex-1 rounded-xl bg-muted py-3 text-sm font-bold text-foreground shadow-sm">
                Não, Voltar
              </button>
              <button onClick={confirmarCancelamento} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-md">
                Sim, Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mensagemFlutuante && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[110] bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 size={18} className="text-green-400" />
          {mensagemFlutuante}
        </div>
      )}

      {alerta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl border border-border">
            <h2 className="mb-2 text-2xl font-black text-foreground">{alerta.titulo}</h2>
            <p className="mb-6 font-semibold text-muted-foreground">{alerta.mensagem}</p>
            <button onClick={() => setAlerta(null)} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}