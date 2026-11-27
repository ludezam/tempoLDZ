// O Tempo LDZ depende de dados em tempo real, então não grava respostas em cache.
const home = new URL(self.registration.scope);
const index = new URL('index.html', home);

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || request.mode !== 'navigate') return;

    const url = new URL(request.url);
    if (url.origin !== home.origin ||
        (url.pathname !== home.pathname && url.pathname !== index.pathname)) return;

    event.respondWith(fetch(request).catch(() => new Response(
        `<!doctype html>
        <html lang="pt-BR">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Tempo LDZ • Sem conexão</title>
        <style>
            body { margin: 2rem; background: #102a4f; color: #fff; font: 1rem system-ui, sans-serif; }
            main { max-width: 32rem; margin: 12vh auto 0; }
            a { color: #b8e4ff; }
        </style>
        <main>
            <h1>Sem conexão</h1>
            <p>O Tempo LDZ precisa de internet para carregar a previsão e o radar.</p>
            <p><a href="./">Tentar novamente</a></p>
        </main>
        </html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    )));
});
