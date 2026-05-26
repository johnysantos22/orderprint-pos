import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { telefone, mensagem } = req.body;

    // Substituiremos isso depois com o IP da sua máquina na Oracle
    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://IP_DA_ORACLE:8080/message/sendText/SUA_INSTANCIA';
    const GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY || 'sua_senha_secreta';

    try {
        const response = await fetch(EVOLUTION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': GLOBAL_API_KEY
            },
            body: JSON.stringify({
                number: telefone,
                text: mensagem
            })
        });

        if (response.ok) {
            return res.status(200).json({ success: true, message: 'Mensagem enviada com sucesso!' });
        } else {
            return res.status(500).json({ error: 'Falha ao conectar com a Evolution API.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}