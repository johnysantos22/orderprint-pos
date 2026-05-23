# 🍕 Pizzaria 2 Irmãos - Sistema de PDV e Catálogo Digital

Um sistema completo e responsivo de Ponto de Venda (PDV), gestão de mesas e catálogo digital, desenvolvido especialmente para atender as necessidades diárias de uma pizzaria.

## 🚀 Funcionalidades

O sistema é dividido em três módulos principais para atender a diferentes fluxos do restaurante:

### 1. Painel do Caixa (PDV)
- **Gestão de Pedidos:** Visualização em tempo real de novos pedidos, sejam eles de mesas ou delivery.
- **Dashboard Financeiro:** Acompanhamento de faturamento diário/semanal/mensal, quantidade de pedidos e ticket médio.
- **Impressão Térmica Automática:** Integração com uma ponte local (`localhost:3333`) para impressão direta de cupons térmicos (cozinha e conferência) sem caixas de diálogo do navegador.
- **Controle de Estoque:** Bloqueio e desbloqueio em tempo real de itens do cardápio (pizzas, bebidas, etc.) marcando-os como "Esgotados".
- **Segurança:** Acesso protegido por PIN (Senhas) com tela de bloqueio e animações nativas.
- **Configurações da Loja:** Gerenciamento do horário de funcionamento e status de "Loja Aberta/Fechada".

### 2. Comanda Eletrônica (Garçom)
- **Acesso Restrito:** Acesso mediante PIN exclusivo para a equipe de salão.
- **Gestão de Mesas:** Abertura de comandas vinculadas ao número da mesa e nome do garçom.
- **Pizza Meia a Meia:** Lógica customizada para pedidos de pizzas com dois sabores, assumindo automaticamente o valor do sabor mais caro.
- **Observações:** Inserção de notas no pedido (ex: "Sem cebola").
- **Sincronização:** Envio direto para a tela do caixa e impressora da cozinha.

### 3. Catálogo Digital (Cliente)
- **Cardápio Online:** Interface amigável para o cliente navegar pelos produtos, com indicação de itens esgotados.
- **Carrinho de Compras:** Gestão do carrinho com cálculo de subtotal, taxas de entrega e total.
- **Integração com WhatsApp:** Envio do pedido formatado diretamente para o WhatsApp do caixa, incluindo comprovantes de PIX.
- **Opções de Entrega e Pagamento:** Suporte para Retirada, Consumo no Local e Delivery (com taxa), além de PIX, Cartão de Crédito e Débito.

---

## 💻 Tecnologias e Ferramentas

- **React (v19) + TypeScript:** Base da aplicação para interfaces dinâmicas, tipadas e reativas.
- **Tailwind CSS:** Estilização utilitária focada em responsividade (Mobile First e layouts fluidos para PDV).
- **Vite:** Bundler super rápido para desenvolvimento e build.
- **Firebase Firestore:** Banco de dados NoSQL em tempo real, garantindo que caixas, garçons e clientes vejam dados atualizados instantaneamente.
- **TanStack Router:** Roteamento moderno e seguro para as trocas de telas.
- **Lucide React:** Biblioteca de ícones elegantes e consistentes.

---

## ⚙️ Como Rodar o Projeto (Desenvolvimento)

### Pré-requisitos
- Node.js instalado (versão 18+ recomendada).
- Uma conta no Firebase com um projeto e Firestore configurados.

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/pizzaria-2-irmaos.git
   cd pizzaria-2-irmaos
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   - Crie um arquivo `.env` na raiz do projeto.
   - Adicione as chaves do seu projeto Firebase de acordo com o `firebase.ts`.

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   O projeto estará disponível em `http://localhost:5173`.

---

## 🖨️ Integração com Impressora Térmica

O sistema foi desenhado para contornar a limitação de impressão padrão dos navegadores (que abrem a janela de pré-visualização). 

Ele faz requisições `POST` para `http://localhost:3333/print`. Para que isso funcione no ambiente de produção/caixa, é necessário rodar um script em Node.js ou Python atuando como "Bridge" (Ponte) na máquina local, recebendo esse JSON e enviando os comandos de texto plano (ESC/POS) direto para a impressora USB térmica.

*(Nota: Caso a ponte local esteja offline, o sistema possui um fallback elegante que abre o painel de impressão nativo do navegador).*

---

## 🛡️ Segurança

As senhas padrão iniciais para o primeiro acesso ao sistema (antes da configuração via Firebase) são:
- **Caixa:** `1234`
- **Garçom:** `5566`

*(É recomendado alterar estas senhas na aba "Configurações > Senhas" logo no primeiro login).*

---
*Desenvolvido com ❤️ para modernizar o atendimento de pizzarias.*
