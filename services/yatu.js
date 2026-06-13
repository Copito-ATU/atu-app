const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY || 'REPLACE_WITH_OPENAI_API_KEY';

const SYSTEM_PROMPT = `Eres Yatu, el asistente de viajes en transporte público de Lima, Perú, dentro de la app ATU.
Eres experto en el sistema de transporte limeño. Responde siempre en español, de forma concisa y amigable.

SISTEMA DE TRANSPORTE LIMA:
• Metropolitano (BRT): eje norte-sur Comas–Chorrillos. Estaciones: Naranjal, Independencia, Caquetá, Quilca, Jr. de la Unión, La Cultura, Angamos, Surco. Letras: A (troncal), B (ramal norte), C, E, H. Frecuencia 3 min en hora punta.
• Metro Línea 1: tren elevado VES–SJL, 26 estaciones. Sale cada 6 min.
• Corredores Complementarios: 201–209 (Javier Prado E-O), 301–305 (Tacna/Arequipa), 401–412 (SJL–Centro). Tarifa integrada S/ 2.80.
• Buses concesionarios: rutas de 4 dígitos (1065, 1185, etc.), operadores privados. Tarifa S/ 1.00–2.50.

PARA SUGERIR RUTAS:
- Indica la línea/letra exacta y las avenidas por las que pasa.
- Menciona dónde subir y bajar (o hacer transbordo).
- Estima el tiempo aproximado.
- Si hay varias opciones, menciona la más rápida primero.

Usa emojis moderadamente (🚌🚇🚏🗺️). No inventes rutas que no existen.`;

export async function askYatu(messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 450,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}
