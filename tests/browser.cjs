// Testes de integração com respostas locais determinísticas; nenhuma API real é chamada.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

function previsao(temperatura = 22, chuva = .1, codigo = 51) {
    const time = Array.from({ length: 48 }, (_, i) =>
        `2026-11-${i < 24 ? '11' : '12'}T${String(i % 24).padStart(2, '0')}:00`);
    return {
        timezone: 'America/Sao_Paulo',
        current: { time: '2026-11-11T21:45', temperature_2m: temperatura,
            apparent_temperature: 26, relative_humidity_2m: 93, wind_speed_10m: 6,
            wind_direction_10m: 75, precipitation: chuva, cloud_cover: 100, weather_code: codigo },
        daily: { time: ['2026-11-11', '2026-11-12'],
            sunrise: ['2026-11-11T05:30', '2026-11-12T05:31'],
            sunset: ['2026-11-11T18:30', '2026-11-12T18:31'] },
        hourly: { time, temperature_2m: time.map(() => temperatura),
            precipitation_probability: time.map(() => 65), precipitation: time.map(() => .2),
            weather_code: time.map(() => 0) }
    };
}

(async () => {
    const server = http.createServer((req, res) => {
        const file = new URL(req.url, 'http://localhost').pathname;
        const name = file === '/' ? 'index.html' : file.slice(1);
        if (!['index.html', 'script.js', 'style.css'].includes(name)) {
            res.writeHead(404); return res.end();
        }
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' :
            name.endsWith('.css') ? 'text/css' : 'text/html');
        res.end(fs.readFileSync(path.join(root, name)));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch(process.env.CHROMIUM_PATH
            ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
        const origin = `http://127.0.0.1:${server.address().port}`;
        for (const perfil of ['desktop', 'android', 'iphone']) {
            const mobile = perfil !== 'desktop';
            const context = await browser.newContext({
                ...(mobile ? devices[perfil === 'iphone' ? 'iPhone 13' : 'Pixel 5'] :
                    { viewport: { width: 1280, height: 900 } }),
                timezoneId: perfil === 'desktop' ? 'Pacific/Auckland' : 'America/Sao_Paulo'
            });
            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
                window.opcoesGPS = [];
                navigator.geolocation.getCurrentPosition = (ok, erro, opcoes) => {
                    window.opcoesGPS.push(opcoes);
                    ok({ coords: { latitude: -20.81972, longitude: -49.37944, accuracy: 30 } });
                };
            });
            const page = await context.newPage();
            const erros = [];
            let chamadasRadar = 0, chamadasReverse = 0, chamadasClima = 0, falhar = false;
            let atrasar = false, liberar, inicioAtrasada;
            let consulta = previsao();
            page.on('pageerror', e => erros.push(e.message));
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.origin === origin) return route.continue();
                if (url.pathname.endsWith('/forecast')) {
                    chamadasClima++;
                    assert.equal(url.searchParams.get('forecast_days'), '2');
                    const dados = structuredClone(consulta);
                    if (atrasar) {
                        atrasar = false;
                        inicioAtrasada();
                        await new Promise(resolve => liberar = resolve);
                    }
                    try {
                        return await route.fulfill(falhar ? { status: 503, json: {} } : { json: dados });
                    } catch (e) {
                        // O AbortController pode cancelar a consulta enquanto o teste a retém.
                        if (!/closed|cancel|invalid|disposed/i.test(e.message)) throw e;
                    }
                }
                if (url.pathname.endsWith('/search')) {
                    const nome = url.searchParams.get('name');
                    return route.fulfill({ json: { results: nome === 'Inexistente' ? [] : [
                        { name: 'São José do Rio Preto', admin1: 'São Paulo', country: 'Brasil',
                            latitude: -20.81972, longitude: -49.37944 },
                        { name: 'Campinas', admin1: 'São Paulo', country: 'Brasil',
                            latitude: -22.9, longitude: -47.06 }
                    ] } });
                }
                if (url.pathname.endsWith('/reverse')) chamadasReverse++;
                if (url.hostname === 'www.rainviewer.com') chamadasRadar++;
                return route.fulfill({ body: '<html>Radar simulado</html>', contentType: 'text/html' });
            });
            await page.goto(origin);
            await page.waitForFunction(() => document.querySelector('#tempAtual').textContent === '22°');
            const leve = perfil === 'android';
            assert.equal(await page.locator('html').evaluate(e => e.classList.contains('modo-leve')), leve);
            assert.equal(await page.locator('.star').count(), leve ? 120 : 350);
            assert.equal(await page.locator('.cloud').count(), leve ? 0 : 38);
            assert.equal(await page.locator('.drop').count(), leve ? 50 : 100);
            assert.equal(await page.locator('.previsao-card').count(), 12);
            assert.equal((await page.locator('.previsao-card .hora').first().textContent()).trim(), '22:00');
            assert.equal((await page.locator('.previsao-card .icone').nth(8).textContent()).trim(), '☀️');
            assert.match(await page.locator('#statusChuva').textContent(), /Chovendo agora/);
            assert.equal(await page.locator('#horaLocal').textContent(), '21:45');
            assert.equal(await page.locator('#cidadeAtual').textContent(), 'Local atual');
            assert.equal(await page.locator('#cidadeAtual').getAttribute('title'), null);
            assert.equal(await page.locator('#coordenadasLocalizacao').textContent(), '');
            assert.equal(await page.locator('#detalhesLocalizacao').evaluate(e => e.open), false);
            await page.click('#controleLocalizacao');
            await page.waitForFunction(() => document.querySelector('#coordenadasLocalizacao').textContent.includes('-20.820, -49.379'));
            await page.click('#controleLocalizacao');
            await page.waitForFunction(() => document.querySelector('#coordenadasLocalizacao').textContent === '');

            const climaAntes = chamadasClima;
            const radarAntes = chamadasRadar;
            await page.click('#btnModo');
            assert.equal(await page.locator('#btnModo').getAttribute('aria-pressed'), String(!leve));
            assert.equal(await page.locator('.star').count(), leve ? 350 : 120);
            assert.equal(await page.locator('.cloud').count(), leve ? 38 : 0);
            assert.equal(await page.locator('.drop').count(), leve ? 100 : 50);
            assert.equal(await page.locator('#tempAtual').textContent(), '22°');
            await page.click('#btnModo');
            assert.equal(await page.locator('#btnModo').getAttribute('aria-pressed'), String(leve));
            assert.equal(await page.locator('.star').count(), leve ? 120 : 350);
            assert.equal(await page.locator('.cloud').count(), leve ? 0 : 38);
            assert.equal(chamadasClima, climaAntes);
            assert.equal(chamadasRadar, radarAntes);
            await page.click('#controleLocalizacao');
            await page.waitForFunction(() => document.querySelector('#coordenadasLocalizacao').textContent.length > 0);
            assert.equal(chamadasReverse, 0);
            assert.equal(await page.evaluate(() => opcoesGPS[0].maximumAge), 300000);

            await page.fill('#cidade', 'Rio');
            await page.waitForSelector('.cidade-item');
            await page.locator('.cidade-item').first().click();
            await page.waitForFunction(() => document.querySelector('#cidadeAtual').textContent.includes('São Paulo'));
            assert.equal(await page.locator('.cidade-item').count(), 0);
            assert.equal(await page.locator('#detalhesLocalizacao').isVisible(), false);
            assert.equal(await page.locator('#coordenadasLocalizacao').textContent(), '');
            assert.equal(chamadasRadar, 1); // Mesmas coordenadas não recarregam o iframe.

            await page.fill('#cidade', 'Cam');
            await page.waitForSelector('.cidade-item');
            await page.press('#cidade', 'ArrowUp'); // Começa pela última opção.
            await page.press('#cidade', 'Enter');
            await page.waitForFunction(() => document.querySelector('#cidadeAtual').textContent.startsWith('Campinas'));
            await page.waitForFunction(() => document.querySelector('#mapaRadar').src.includes('-22.9,-47.06'));

            consulta = previsao(23, 0, 3);
            await page.click('#btnGPS');
            await page.waitForFunction(() => document.querySelector('#tempAtual').textContent === '23°');
            assert.equal(await page.locator('.drop').count(), 0); // 65% de chance não é chuva atual.
            assert.match(await page.locator('#infoChuvaAtual').textContent(), /65%/);
            assert.equal(await page.evaluate(() => opcoesGPS.at(-1).maximumAge), 0);

            consulta = previsao(10, 0, 3);
            atrasar = true;
            const iniciada = new Promise(resolve => inicioAtrasada = resolve);
            await page.click('#btnGPS');
            await iniciada;
            consulta = previsao(25, .1, 51);
            await page.fill('#cidade', 'Cam');
            await page.press('#cidade', 'Enter');
            await page.waitForFunction(() => document.querySelector('#tempAtual').textContent === '25°');
            liberar();
            await page.waitForTimeout(100);
            assert.equal(await page.locator('#tempAtual').textContent(), '25°');

            await page.fill('#cidade', 'Inexistente');
            await page.press('#cidade', 'Enter');
            await page.waitForFunction(() => document.querySelector('#mensagemBusca').textContent.includes('Nenhuma'));
            falhar = true;
            await page.click('#btnGPS');
            await page.waitForFunction(() => document.querySelector('#statusChuva').textContent.includes('Não foi possível atualizar'));
            for (const [code, texto] of [[1, 'negada'], [2, 'indisponível'], [3, 'esgotado']]) {
                await page.evaluate(code => {
                    navigator.geolocation.getCurrentPosition = (ok, erro) => erro({ code });
                }, code);
                await page.click('#btnGPS');
                assert.match(await page.locator('#cidadeAtual').textContent(), new RegExp(texto));
            }
            assert.deepEqual(erros, []);
            await context.close();
            console.log(`${perfil}: privacidade, troca de visual e regressão de previsão/busca/radar OK`);
        }
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(erro => { console.error(erro); process.exitCode = 1; });

