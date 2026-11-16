// Mon audit budget — relais IA (Cloudflare Worker + Workers AI)
// Rôle : recevoir du texte DÉJÀ ANONYMISÉ par l'app, le faire analyser par un modèle Workers AI, renvoyer la réponse.
// Rien n'est stocké ni journalisé ici. Seule l'app officielle (origine autorisée) peut l'appeler depuis un navigateur.
const ALLOWED = ['https://camilbounader.github.io', 'http://localhost:8766'];
// Modèles essayés dans l'ordre (le premier disponible répond). Modifiable via la variable MODELS.
const DEFAULT_MODELS = '@cf/mistralai/mistral-small-3.1-24b-instruct,@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-3.1-8b-instruct';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Relais IA de « Mon audit budget » : opérationnel.', { headers: cors });
    if (!ALLOWED.includes(origin)) return json({ error: 'origine non autorisée' }, 403, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'requête invalide' }, 400, cors); }
    const { system = '', user, max_tokens = 2048 } = body || {};
    if (typeof user !== 'string' || !user || user.length > 60000 || String(system).length > 10000) return json({ error: 'requête trop volumineuse ou vide' }, 413, cors);
    if (!env.AI) return json({ error: 'liaison Workers AI absente (variable « AI »)' }, 500, cors);
    const models = String(env.MODELS || DEFAULT_MODELS).split(',').map(s => s.trim()).filter(Boolean);
    let lastErr = '';
    for (const model of models) {
      try {
        const out = await env.AI.run(model, { messages: [{ role: 'system', content: String(system) }, { role: 'user', content: user }], max_tokens: Math.min(+max_tokens || 2048, 4096), temperature: 0.1 });
        let text = typeof out === 'string' ? out : (out && (out.response ?? (out.result && out.result.response) ?? (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content)));
        if (text != null && typeof text !== 'string') text = JSON.stringify(text);
        if (text) return json({ model, text }, 200, cors);
        lastErr = 'réponse vide';
      } catch (e) { lastErr = String((e && e.message) || e); }
    }
    return json({ error: 'IA indisponible : ' + lastErr }, 502, cors);
  }
};
function json(o, status, headers) { return new Response(JSON.stringify(o), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }); }
