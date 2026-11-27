document.addEventListener("DOMContentLoaded", () => {

/* =====================================================
   ELEMENTOS
===================================================== */
const $ = id => document.getElementById(id);

// Somente nomes e rótulos internos, definidos pelo site, entram no SVG.
function svgIcone(nome, classe = "", rotulo = "") {
    const acesso = rotulo ? `role="img" aria-label="${rotulo}"` : 'aria-hidden="true"';
    return `<svg class="ldz-icon ${classe}" ${acesso} focusable="false"><use href="#ldz-${nome}"/></svg>`;
}

function textoComIcone(elemento, icone, texto, classe) {
    elemento.innerHTML = svgIcone(icone, classe);
    elemento.append(` ${texto}`);
}

/* =====================================================
   ESTADO GLOBAL
===================================================== */
let LAT = null;
let LON = null;
let versaoLocalizacao = 0;
let versaoConsultaClima = 0;
let consultaClimaAtiva;
let ultimaAtualizacao = 0;
let localizacaoGPS = null;
const INTERVALO_CLIMA = 300000;
const CODIGOS_GAROA = [51, 53, 55, 56, 57];
const CODIGOS_CHUVA_SEM_TROVAO = [61, 63, 65, 66, 67, 80, 81, 82];
const CODIGOS_TROVOADA = [95, 96, 99];
const CODIGOS_CHUVA = [...CODIGOS_GAROA, ...CODIGOS_CHUVA_SEM_TROVAO, ...CODIGOS_TROVOADA];

// Datas da API são horários civis da cidade, sem offset. UTC aqui serve apenas
// como base de comparação, impedindo interferência do fuso do dispositivo.
const dataCidade = valor => new Date(`${valor}Z`);
const horarioEmMinutos = valor => Number(valor.slice(11, 13)) * 60 + Number(valor.slice(14, 16));
const choveAgora = () => climaAtual.chuva > 0 || CODIGOS_CHUVA.includes(climaAtual.weatherCode);

// Mantém o critério anterior e aplica o modo leve a todos os efeitos locais.
const dispositivoAppleMovel = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let modoLeve = !dispositivoAppleMovel &&
    (window.innerWidth < 700 || navigator.hardwareConcurrency <= 4);
document.documentElement.classList.toggle("modo-leve", modoLeve);

let climaAtual = {
    temperatura: 0,
    sensacao: 0,
    umidade: 0,
    vento: 0,
    direcaoVento: 0,
    chuva: 0,
    probabilidade: 0,
    cloudCover: 0,
    weatherCode: 0,
    sunrise: null,
    sunset: null,
    horarioLocal: null,
    deslocamentoUTC: 0,
    proximaChuva: false
};

/* =====================================================
   TEMPO LOCAL DA CIDADE
===================================================== */
function obterHoraCidade() {
    if (!climaAtual.horarioLocal)
        return new Date();
    return dataCidade(climaAtual.horarioLocal);
}

/* =====================================================
   CALCULA POSIÇÃO NO CICLO DIA/NOITE
===================================================== */
function calcularPosicaoDiaNoite() {
    const agora = obterHoraCidade().getTime();
    const nascer = dataCidade(climaAtual.sunrise).getTime();
    const por = dataCidade(climaAtual.sunset).getTime();

    if (agora >= nascer && agora <= por) {
        // Durante o dia: calcula progresso de 0 a 1
        return {
            ehDia: true,
            progresso: (agora - nascer) / (por - nascer),
            tempoAtual: agora,
            nascer: nascer,
            por: por
        };
    } else {
        // Durante a noite: calcula progresso de 0 a 1
        let inicioNoite = por;
        let fimNoite = nascer + 86400000; // próximo nascer

        if (agora < nascer) {
            inicioNoite = por - 86400000; // pôr anterior
            fimNoite = nascer;
        }

        return {
            ehDia: false,
            progresso: (agora - inicioNoite) / (fimNoite - inicioNoite),
            tempoAtual: agora,
            nascer: nascer,
            por: por
        };
    }
}

/* =====================================================
   GEOLOCALIZAÇÃO
===================================================== */
function ocultarLocalizacao() {
    localizacaoGPS = null;
    $("controleLocalizacao").textContent = "Mostrar localização";
    $("detalhesLocalizacao").open = false;
    $("detalhesLocalizacao").hidden = true;
    $("coordenadasLocalizacao").textContent = "";
}

$("detalhesLocalizacao").addEventListener("toggle", () => {
    const aberto = $("detalhesLocalizacao").open;
    $("controleLocalizacao").textContent = aberto ? "Ocultar localização" : "Mostrar localização";
    $("coordenadasLocalizacao").textContent = aberto && localizacaoGPS
        ? `${localizacaoGPS.latitude.toFixed(3)}, ${localizacaoGPS.longitude.toFixed(3)}` +
          (Number.isFinite(localizacaoGPS.accuracy) ? ` · Precisão estimada: ${Math.round(localizacaoGPS.accuracy)} m` : "")
        : "";
});

function iniciarGPS(forcarAtualizacao = false) {
    ocultarLocalizacao();
    const versao = ++versaoLocalizacao;
    $("cidadeAtual").textContent =
        "Buscando localização...";
    if (!navigator.geolocation) {
        $("cidadeAtual").textContent =
            "GPS não suportado. Busque manualmente";
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            if (versao !== versaoLocalizacao) return;
            LAT = pos.coords.latitude;
            LON = pos.coords.longitude;
            atualizarLua();
            // A API de busca não oferece geocodificação reversa neste endpoint.
            $("cidadeAtual").textContent = "Local atual";
            localizacaoGPS = { latitude: LAT, longitude: LON, accuracy: pos.coords.accuracy };
            $("detalhesLocalizacao").hidden = false;
            atualizarClima();
        },
        erro => {
            if (versao !== versaoLocalizacao) return;
            console.error("Erro GPS:", erro);
            const mensagens = {
                1: "Permissão de localização negada. Busque uma cidade.",
                2: "Localização indisponível. Busque uma cidade.",
                3: "Tempo de localização esgotado. Tente novamente ou busque uma cidade."
            };
            $("cidadeAtual").textContent = mensagens[erro.code] || "Não foi possível localizar. Busque uma cidade.";
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: forcarAtualizacao ? 0 : INTERVALO_CLIMA
        }
    );
}

/* =====================================================
     OPEN METEO
===================================================== */
async function atualizarClima() { 
    if (LAT === null || LON === null)
        return;
    const consulta = ++versaoConsultaClima;
    const localizacao = versaoLocalizacao;
    const latitude = LAT;
    const longitude = LON;
    if (consultaClimaAtiva) consultaClimaAtiva.abort();
    const controlador = new AbortController();
    consultaClimaAtiva = controlador;
    const limite = setTimeout(() => controlador.abort(), 15000);
    $("statusChuva").textContent = "Atualizando clima...";
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m,cloud_cover,weather_code&daily=sunrise,sunset&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timezone=auto&forecast_days=2`;
        const resposta = await fetch(url, { cache: "no-store", signal: controlador.signal });
        if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status}`);
        const dados = await resposta.json();
        // Ignora respostas de outra cidade ou de uma atualização anterior.
        if (consulta !== versaoConsultaClima || localizacao !== versaoLocalizacao ||
            latitude !== LAT || longitude !== LON) return;
        if (!dados.current || !dados.hourly?.time?.length || !dados.daily?.sunrise?.length) {
            throw new Error("Resposta meteorológica incompleta");
        }
        // A probabilidade horária do Open-Meteo cobre a hora anterior ao horário indicado.
        const indiceAtual = dados.hourly.time.findIndex(hora => hora > dados.current.time);
        climaAtual.temperatura = dados.current.temperature_2m;
        climaAtual.sensacao = dados.current.apparent_temperature;
        climaAtual.umidade = dados.current.relative_humidity_2m;
        climaAtual.vento = dados.current.wind_speed_10m;
        climaAtual.direcaoVento = dados.current.wind_direction_10m || 0;
        climaAtual.chuva = dados.current.precipitation;
        climaAtual.probabilidade = dados.hourly.precipitation_probability?.[indiceAtual] ?? null;
        climaAtual.cloudCover = dados.current.cloud_cover;
        climaAtual.weatherCode = dados.current.weather_code;
        climaAtual.sunrise = dados.daily.sunrise[0];
        climaAtual.sunset = dados.daily.sunset[0];
        climaAtual.horarioLocal = dados.current.time;
        climaAtual.deslocamentoUTC = Number.isFinite(dados.utc_offset_seconds)
            ? dados.utc_offset_seconds : 0;

        atualizarMapa();
        renderizar12Horas(dados.hourly, dados.daily);
        atualizarDescricao(dados.hourly);
        atualizarCeu();
        atualizarSolLua();
        atualizarNuvens();
        atualizarChuva();
        atualizarNeblina();
        atualizarEstrelas();
        ultimaAtualizacao = Date.now();
    }
    catch (erro) {
        if (consulta !== versaoConsultaClima || localizacao !== versaoLocalizacao) return;
        console.error("Falha ao atualizar clima:", erro);
        $("statusChuva").textContent = "Não foi possível atualizar. Os dados exibidos podem estar desatualizados.";
    } finally {
        clearTimeout(limite);
        if (consultaClimaAtiva === controlador) consultaClimaAtiva = null;
    }
}

/* =====================================================
   INTERFACE
===================================================== */
function atualizarInterface() {
    $("tempAtual").textContent = Math.round(climaAtual.temperatura) + "°";
    $("sensacaoAtual").textContent = Math.round(climaAtual.sensacao) + "°";
    $("sensacaoAtual").closest(".item").classList.toggle("calor-extremo", climaAtual.sensacao >= 38);
    $("umidadeAtual").textContent = climaAtual.umidade + "%";
    $("ventoAtual").textContent = Math.round(climaAtual.vento) + " km/h";

    $("sunrise").textContent = climaAtual.sunrise.slice(11,16);
    $("sunset").textContent = climaAtual.sunset.slice(11,16);

    // Atualizar seta de vento
    atualizarSetaVento();

    // Atualizar info de precipitação em tempo real
    const infoChuva = $("infoChuvaAtual");
    if (climaAtual.chuva > 0) {
        infoChuva.innerHTML = `${svgIcone("gota")} <strong>${climaAtual.chuva.toFixed(1)}mm</strong> de chuva`;
        infoChuva.style.display = "block";
    } else if (climaAtual.probabilidade > 0) {
        infoChuva.innerHTML = `${svgIcone("gota")} ${climaAtual.probabilidade}% de probabilidade`;
        infoChuva.style.display = "block";
    } else {
        infoChuva.style.display = "none";
    }

    if (climaAtual.chuva > 0.5) {
        textoComIcone($("statusChuva"), "aviso", "Chuva Forte", "ldz-alerta-forte");
    }
    else if (choveAgora()) {
        textoComIcone($("statusChuva"), "chuva-contorno", "Chovendo agora");
    }
    else if (climaAtual.probabilidade > 40) {
        textoComIcone($("statusChuva"), "aviso", "Chuva Chegando", "ldz-alerta");
    }
    else if (climaAtual.proximaChuva) {
        textoComIcone($("statusChuva"), "aviso", "Chuva nas próximas horas", "ldz-alerta");
    }
    else {
        textoComIcone($("statusChuva"), "estavel", "Tempo Estável", "ldz-estavel");
    }
}

/* =====================================================
   ATUALIZAR DESCRIÇÃO (COM PREVISÃO DE CHUVA)
===================================================== */
function atualizarDescricao(h) {

    const agora = dataCidade(climaAtual.horarioLocal);

    let inicio = h.time.findIndex(t =>
        dataCidade(t) >= agora
    );

    if (inicio < 0) inicio = 0;

    let chuvaTotal = 0;
    let horasComChuva = 0;

    for (let i = inicio; i < inicio + 12; i++) {

        const prob = h.precipitation_probability[i] ?? 0;
        const amount = h.precipitation[i] ?? 0;

        chuvaTotal += amount;
        if (prob > 10 || amount > 0.1) horasComChuva++;
    }

    if (horasComChuva > 0 || chuvaTotal > 0) {
        textoComIcone($("descricaoAtual"), "chuva-contorno",
            `${chuvaTotal.toFixed(1)} mm previstos nas próximas 12 horas` +
            (horasComChuva > 0 ? `; possibilidade de chuva em ${horasComChuva} dessas horas` : ""));

        climaAtual.proximaChuva = true;
    } else {
        $('descricaoAtual').textContent =
            "Sem chuva nas próximas horas";

        climaAtual.proximaChuva = false;
    }

    atualizarInterface();
}

/* =====================================================
   RADAR
===================================================== */
function atualizarMapa() {
    const url = `https://www.rainviewer.com/map.html?loc=${LAT},${LON},10&oFa=0&layer=radar`;
    if ($("mapaRadar").getAttribute("src") !== url) $("mapaRadar").src = url;
}

/* =====================================================
   BUSCA DE CIDADE
===================================================== */
const campoCidade = $("cidade");
const listaCidades = $("listaCidades");
let sugestoes = [];
let indiceSugestao = -1;
let timerSugestoes;
let pedidoSugestoes;
let versaoSugestoes = 0;

campoCidade.setAttribute("role", "combobox");
campoCidade.setAttribute("aria-autocomplete", "list");
campoCidade.setAttribute("aria-controls", "listaCidades");
campoCidade.setAttribute("aria-expanded", "false");
listaCidades.setAttribute("role", "listbox");

function fecharSugestoes() {
    $("mensagemBusca").textContent = "";
    clearTimeout(timerSugestoes);
    if (pedidoSugestoes) pedidoSugestoes.abort();
    ++versaoSugestoes;
    sugestoes = [];
    indiceSugestao = -1;
    listaCidades.replaceChildren();
    listaCidades.classList.remove("ativo");
    campoCidade.setAttribute("aria-expanded", "false");
    campoCidade.removeAttribute("aria-activedescendant");
}

function selecionarCidade(local) {
    fecharSugestoes();
    ocultarLocalizacao();
    ++versaoLocalizacao;
    LAT = local.latitude;
    LON = local.longitude;
    atualizarLua();
    campoCidade.value = local.name;
    $("cidadeAtual").textContent = [local.name, local.admin1, local.country]
        .filter(Boolean).join(", ");
    atualizarClima();
    atualizarEstrelas();
}

async function buscarCidade() {
    const nome = campoCidade.value.trim();
    if (!nome) return;
    fecharSugestoes();
    const versao = versaoSugestoes;
    try {
        const resposta = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt`);
        if (!resposta.ok) throw new Error("Falha na busca de cidade");
        const dados = await resposta.json();
        if (versao !== versaoSugestoes || campoCidade.value.trim() !== nome) return;
        if (dados.results?.length) selecionarCidade(dados.results[0]);
        else $("mensagemBusca").textContent = "Nenhuma cidade encontrada. Confira o nome e tente novamente.";
    } catch (erro) {
        console.error("Erro ao buscar cidade:", erro);
        if (versao === versaoSugestoes) $("mensagemBusca").textContent = "Não foi possível buscar cidades. Tente novamente.";
    }
}

campoCidade.addEventListener("input", () => {
    fecharSugestoes();
    const nome = campoCidade.value.trim();
    if (nome.length < 2) return;
    const versao = versaoSugestoes;
    timerSugestoes = setTimeout(async () => {
        pedidoSugestoes = new AbortController();
        try {
            const resposta = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=8&language=pt`, { signal: pedidoSugestoes.signal });
            if (!resposta.ok) throw new Error("Falha nas sugestões");
            const dados = await resposta.json();
            if (versao !== versaoSugestoes) return;
            sugestoes = dados.results || [];
            if (!sugestoes.length) $("mensagemBusca").textContent = "Nenhuma cidade encontrada.";
            sugestoes.forEach((local, i) => {
                const item = document.createElement("div");
                item.className = "cidade-item";
                item.id = `sugestao-cidade-${i}`;
                item.setAttribute("role", "option");
                item.setAttribute("aria-selected", "false");
                const nomeItem = document.createElement("span");
                nomeItem.className = "cidade-item-nome";
                nomeItem.textContent = local.name;
                const regiao = document.createElement("span");
                regiao.className = "cidade-item-estado";
                regiao.textContent = [local.admin1, local.country].filter(Boolean).join(", ");
                item.append(nomeItem, regiao);
                item.addEventListener("click", () => selecionarCidade(local));
                listaCidades.appendChild(item);
            });
            listaCidades.classList.toggle("ativo", sugestoes.length > 0);
            campoCidade.setAttribute("aria-expanded", String(sugestoes.length > 0));
        } catch (erro) {
            if (erro.name !== "AbortError" && versao === versaoSugestoes) {
                console.error("Erro nas sugestões:", erro);
                $("mensagemBusca").textContent = "Sugestões indisponíveis. Tente buscar novamente.";
            }
        }
    }, 300);
});

campoCidade.addEventListener("keydown", e => {
    if (e.isComposing) return;
    if (e.key === "Tab") { fecharSugestoes(); return; }
    if (e.key === "Escape") { fecharSugestoes(); return; }
    if (e.key === "Enter") {
        e.preventDefault();
        if (indiceSugestao >= 0) selecionarCidade(sugestoes[indiceSugestao]);
        else buscarCidade();
        return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(e.key) || !sugestoes.length) return;
    e.preventDefault();
    indiceSugestao = indiceSugestao < 0
        ? (e.key === "ArrowDown" ? 0 : sugestoes.length - 1)
        : (indiceSugestao + (e.key === "ArrowDown" ? 1 : -1) + sugestoes.length) % sugestoes.length;
    Array.from(listaCidades.children).forEach((item, i) => {
        item.classList.toggle("destaque", i === indiceSugestao);
        item.setAttribute("aria-selected", String(i === indiceSugestao));
    });
    const ativo = listaCidades.children[indiceSugestao];
    campoCidade.setAttribute("aria-activedescendant", ativo.id);
    ativo.scrollIntoView({ block: "nearest" });
});

document.addEventListener("click", e => {
    if (!campoCidade.parentElement.contains(e.target) && !$("btnBuscar").contains(e.target)) fecharSugestoes();
});

function usarGPS() {
    iniciarGPS(true);
}

/* =====================================================
   CÉU DINÂMICO - BASEADO EM NASCER/PÔR DO SOL
===================================================== */
function atualizarCeu() {
    const sky = document.getElementById("sky");
    const ciclo = calcularPosicaoDiaNoite();
    let gradiente = "";
    const p = ciclo.progresso;
    const nuvens = climaAtual.cloudCover / 100;

    if (ciclo.ehDia) {
        // ☀️ CICLO DIURNO (0 = nascer, 1 = pôr)

        if (p < 0.15) {
            // 🌅 Amanhecer (0-15% do dia)
            const t = p / 0.15;
            gradiente = `linear-gradient(180deg, 
                #ff6b35 ${0 + t * 30}%, 
                #ffa500 ${30 + t * 20}%, 
                #87ceeb ${50 + t * 30}%, 
                #e0f6ff 100%)`;
        }
        else if (p < 0.35) {
            // 🌤️ Manhã clara (15-35% do dia)
            const t = (p - 0.15) / 0.2;
            gradiente = `linear-gradient(180deg, 
                #6dbfff ${0 + t * 10}%, 
                #87ceeb ${10 + t * 20}%, 
                #bce7ff ${30 + t * 10}%, 
                #e0f6ff 100%)`;
        }
        else if (p < 0.65) {
            // ☀️ Meio do dia (35-65% do dia)
            gradiente = `linear-gradient(180deg, 
                #4ea5ff 0%, 
                #87ceeb 30%, 
                #82d4ff 70%, 
                #b0e0e6 100%)`;
        }
        else if (p < 0.85) {
            // 🌇 Transição para entardecer (65-85% do dia)
            const t = (p - 0.65) / 0.2;
            gradiente = `linear-gradient(180deg, 
                #ff8c42 ${0 + t * 20}%, 
                #ff9d5c ${20 + t * 20}%, 
                #ffa500 ${40 + t * 20}%, 
                #3f6ed7 ${60 + t * 20}%, 
                #1a3a52 100%)`;
        }
        else {
            // 🌅 Pôr do sol (85-100% do dia)
            const t = (p - 0.85) / 0.15;
            gradiente = `linear-gradient(180deg, 
                #ff4500 ${0 + t * 10}%, 
                #ff6b5b ${10 + t * 15}%, 
                #ff8c69 ${25 + t * 15}%, 
                #ffa07a ${40 + t * 10}%, 
                #8b6341 ${50 + t * 15}%, 
                #2c1810 ${65 + t * 20}%, 
                #020611 100%)`;
        }
    } else {
        // 🌙 CICLO NOTURNO (0 = pôr, 1 = nascer)

        if (p < 0.1) {
            // 🌆 Crepúsculo vespertino (0-10% da noite)
            const t = p / 0.1;
            gradiente = `linear-gradient(180deg, 
                #4a235a ${0}%, 
                #1a0033 ${30 + t * 20}%, 
                #0a0015 ${60 + t * 20}%, 
                #020611 100%)`;
        }
        else if (p < 0.9) {
            // 🌙 Noite profunda (10-90% da noite)
            gradiente = `linear-gradient(180deg, #020611 0%, #071028 100%)`;
        }
        else {
            // 🌅 Crepúsculo matutino (90-100% da noite)
            const t = (p - 0.9) / 0.1;
            gradiente = `linear-gradient(180deg, 
                #0a0015 ${0}%, 
                #1a0033 ${20 - t * 10}%, 
                #4a235a ${40 - t * 15}%, 
                #ff4500 ${70 + t * 15}%, 
                #ff6b5b ${85 + t * 10}%, 
                #ffb366 100%)`;
        }
    }

    // Aplicar efeito de nuvens ao gradiente
    const brilho = 1 - (nuvens * 0.3);
    sky.style.background = gradiente;
    sky.style.filter = `brightness(${brilho})`;
}

/* =====================================================
   SOL / LUA DO FUNDO
===================================================== */
/* SunCalc v1.9.0, reduzido às funções de posição e iluminação.
 * https://github.com/mourner/suncalc/tree/v1.9.0
 *
Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
const astronomiaLocal = (() => {
    var PI   = Math.PI,
        sin  = Math.sin,
        cos  = Math.cos,
        tan  = Math.tan,
        asin = Math.asin,
        atan = Math.atan2,
        acos = Math.acos,
        rad  = PI / 180;

    // sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


    // date/time constants and conversions

    var dayMs = 1000 * 60 * 60 * 24,
        J1970 = 2440588,
        J2000 = 2451545;

    function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
    function toDays(date)   { return toJulian(date) - J2000; }


    // general calculations for position

    var e = rad * 23.4397; // obliquity of the Earth

    function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
    function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }

    function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)); }
    function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)); }

    function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }

    function astroRefraction(h) {
        if (h < 0) // the following formula works for positive altitudes only.
            h = 0; // if h = -0.08901179 a div/0 would occur.

        // formula 16.4 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
        // 1.02 / tan(h + 10.26 / (h + 5.10)) h in degrees, result in arc minutes -> converted to rad:
        return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
    }

    // general sun calculations

    function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

    function eclipticLongitude(M) {

        var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
            P = rad * 102.9372; // perihelion of the Earth

        return M + C + P + PI;
    }

    function sunCoords(d) {

        var M = solarMeanAnomaly(d),
            L = eclipticLongitude(M);

        return {
            dec: declination(L, 0),
            ra: rightAscension(L, 0)
        };
    }


    var SunCalc = {};

    SunCalc.getPosition = function (date, lat, lng) {

        var lw  = rad * -lng,
            phi = rad * lat,
            d   = toDays(date),

            c  = sunCoords(d),
            H  = siderealTime(d, lw) - c.ra;

        return {
            azimuth: azimuth(H, phi, c.dec),
            altitude: altitude(H, phi, c.dec)
        };
    };

    // moon calculations, based on http://aa.quae.nl/en/reken/hemelpositie.html formulas

    function moonCoords(d) { // geocentric ecliptic coordinates of the moon

        var L = rad * (218.316 + 13.176396 * d), // ecliptic longitude
            M = rad * (134.963 + 13.064993 * d), // mean anomaly
            F = rad * (93.272 + 13.229350 * d),  // mean distance

            l  = L + rad * 6.289 * sin(M), // longitude
            b  = rad * 5.128 * sin(F),     // latitude
            dt = 385001 - 20905 * cos(M);  // distance to the moon in km

        return {
            ra: rightAscension(l, b),
            dec: declination(l, b),
            dist: dt
        };
    }

    SunCalc.getMoonPosition = function (date, lat, lng) {

        var lw  = rad * -lng,
            phi = rad * lat,
            d   = toDays(date),

            c = moonCoords(d),
            H = siderealTime(d, lw) - c.ra,
            h = altitude(H, phi, c.dec),
            // formula 14.1 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
            pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));

        // Corrige a paralaxe lunar antes de estimar a refração junto ao horizonte.
        h -= asin(6378.14 / c.dist * cos(h));
        h += astroRefraction(h);

        return {
            azimuth: azimuth(H, phi, c.dec),
            altitude: h,
            distance: c.dist,
            parallacticAngle: pa
        };
    };


    // calculations for illumination parameters of the moon,
    // based on http://idlastro.gsfc.nasa.gov/ftp/pro/astro/mphase.pro formulas and
    // Chapter 48 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.

    SunCalc.getMoonIllumination = function (date) {

        var d = toDays(date || new Date()),
            s = sunCoords(d),
            m = moonCoords(d),

            sdist = 149598000, // distance from Earth to Sun in km

            dot = sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra),
            phi = acos(Math.max(-1, Math.min(1, dot))),
            inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)),
            angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) -
                    cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));

        return {
            fraction: (1 + cos(inc)) / 2,
            phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
            angle: angle
        };
    };
    return SunCalc;
})();

const limitar01 = valor => Math.max(0, Math.min(1, valor));
let inclinacaoLua = null;

// O lado iluminado começa à direita. A borda esquerda é o contorno
// do disco; a outra curva é o terminador (linha entre luz e sombra).
function desenharSombraLua(fracaoIluminada) {
    const curva = 1 - 2 * limitar01(fracaoIluminada);
    const raio = Math.abs(curva) * 50;
    const terminador = raio < 0.01
        ? "L50 0"
        : `A${raio.toFixed(3)} 50 0 0 ${curva > 0 ? 0 : 1} 50 0`;
    return `M50 0A50 50 0 0 0 50 100${terminador}Z`;
}

function atualizarLua(agora = new Date()) {
    if (document.hidden || !Number.isFinite(LAT) || !Number.isFinite(LON)) return;
    const lua = document.querySelector(".moon");
    const graus = 180 / Math.PI;
    // As coordenadas já definem o céu local; um instante UTC real evita
    // aplicar o fuso da cidade duas vezes ou usar a hora da última previsão.
    const pos = astronomiaLocal.getMoonPosition(agora, LAT, LON);
    const alt = pos.altitude * graus;
    const solAlt = astronomiaLocal.getPosition(agora, LAT, LON).altitude * graus;
    if (alt <= 0 || solAlt >= 0) {
        lua.style.opacity = 0;
        return;
    }

    const fase = astronomiaLocal.getMoonIllumination(agora);
    // Projeção estilizada: leste à esquerda, oeste à direita.
    const x = 50 + 36 * Math.sin(pos.azimuth) * Math.cos(pos.altitude);
    const y = 82 - 68 * (Math.min(alt, 90) / 90);
    // Converte a orientação em relação ao zênite para rotação CSS.
    const alvo = (pos.parallacticAngle - fase.angle) * graus - 90;
    if (inclinacaoLua === null) inclinacaoLua = alvo;
    else inclinacaoLua += (((alvo - inclinacaoLua + 180) % 360 + 360) % 360) - 180;

    lua.style.setProperty("--lua-x", `${x.toFixed(2)}vw`);
    lua.style.setProperty("--lua-y", `${y.toFixed(2)}vh`);
    lua.style.setProperty("--lua-inclinacao", `${inclinacaoLua.toFixed(2)}deg`);
    $("sombraLua").setAttribute("d", desenharSombraLua(fase.fraction));
    const nuvens = limitar01(climaAtual.cloudCover / 100);
    lua.style.opacity = (0.96 - nuvens * 0.60) * limitar01(alt / 3)
        * limitar01(-solAlt / 6) * limitar01(fase.fraction / 0.09);
}

function atualizarSolLua() {
    const sun = document.querySelector(".sun");
    const ciclo = calcularPosicaoDiaNoite();
    const nuvens = limitar01(climaAtual.cloudCover / 100);
    if (ciclo.ehDia) {
        const p = ciclo.progresso;
        sun.style.setProperty("--sol-x", `${5 + p * 90}vw`);
        sun.style.setProperty("--sol-y", `${78 - Math.sin(p * Math.PI) * 65}vh`);
        sun.style.opacity = Math.max(0.25, 1 - nuvens * 0.65);
    } else {
        sun.style.opacity = 0;
    }
    atualizarLua();
}

/* =====================================================
   ESTRELAS
===================================================== */
let estrelasCriadas = false;

function gerarEstrelas() {
    const layer = $("stars");
    layer.innerHTML = "";
    const total = modoLeve ? 120 : 350;
    const fragmento = document.createDocumentFragment();
    const cores = ["#ffffff", "#fff4d6", "#ffe7b3", "#dcecff", "#e8f2ff"];


    for (let i = 0; i < total; i++) {
        const star = document.createElement("div");
        star.className = "star";
        star.style.left = Math.random() * 100 + "vw";
        star.style.top = Math.random() * 100 + "vh";

        const size = Math.random() * 2.5 + 0.25;
        star.style.width = size + "px";
        star.style.height = size + "px";
        star.style.animationDuration = (1 + Math.random() * 4) + "s";
        star.style.opacity = 0.3 + Math.random() * 0.7;

		star.style.background =
		cores[Math.floor(Math.random() * cores.length)];

        fragmento.appendChild(star);
    }
    layer.appendChild(fragmento);
    estrelasCriadas = true;
}

function atualizarEstrelas() {

    if (!estrelasCriadas)
        gerarEstrelas();
    const stars = $("stars");
    if (!climaAtual.sunrise || !climaAtual.sunset) {
        stars.style.opacity = 0;
        return;
    }

    const ciclo = calcularPosicaoDiaNoite();
    const cloud = (climaAtual.cloudCover || 0) / 100;

    document.body.classList.toggle("ldz-icons-dia", ciclo.ehDia);
    if (ciclo.ehDia) {
        stars.style.opacity = 0;
		document.body.style.color = "#10438f";
        return;
    }

    stars.style.opacity = Math.max(0.15, 1 - cloud);
	document.body.style.color = "#fff";
}

/* =====================================================
   ESTRELA CADENTE
===================================================== */
function criarEstrelaCadente() {
    if (modoLeve || document.hidden) return;

    if (climaAtual.cloudCover > 25)
        return;
    const ciclo = calcularPosicaoDiaNoite();

    if (ciclo.ehDia)
        return;
    const meteor = document.createElement("div");
    meteor.className = "meteor";
    meteor.style.left = (20 + Math.random() * 70) + "vw";
    meteor.style.top = (5 + Math.random() * 35) + "vh";
    document.body.appendChild(meteor);

    setTimeout(() => {
        meteor.remove();
    }, 2500);
}

setInterval(() => {
    if (modoLeve || document.hidden || !climaAtual.sunrise) return;
    const ciclo = calcularPosicaoDiaNoite();
    if (ciclo.ehDia)
        return;
    const quantidade =
        Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < quantidade; i++) {
        setTimeout(() => {
            criarEstrelaCadente();
        }, Math.random() * 15000); // cada 15 segundos
    }

}, 20000);

/* =====================================================
   LOOP VISUAL
===================================================== */
setInterval(() => {
    if (document.hidden || !climaAtual.sunrise) return;
    atualizarCeu();
    atualizarSolLua();
    atualizarEstrelas();
}, 30000); // 30 seg

/* =====================================================
   NUVENS
===================================================== */

function atualizarNuvens() {
    const back = $("cloudBack");
    const front = $("cloudFront");

    back.innerHTML = "";
    front.innerHTML = "";

    if (modoLeve) return; // As camadas estão ocultas por CSS.
    const quantidade = Math.max(2, Math.round(climaAtual.cloudCover / 4));
    for (let i = 0; i < quantidade; i++) {
        criarNuvem(back, false);
    }
    for (let i = 0; i < quantidade / 2; i++) {
        criarNuvem(front, true);
    }
}

function criarNuvem(layer, frontal) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";
    const largura = frontal ? 180 + Math.random() * 250 : 120 + Math.random() * 180;
    const altura = largura * 0.45;

    cloud.style.width = largura + "px";
    cloud.style.height = altura + "px";
    cloud.style.top = Math.random() * 65 + "vh";
    cloud.style.left = (-30 + Math.random() * 120) + "vw";

    const velocidadeBase = frontal ? 70 : 120;
    const vento = Math.max(1, climaAtual.vento);
    
	// ✅ Calcular deslocamento vertical baseado na direção do vento
    const rad = (climaAtual.direcaoVento - 180) * Math.PI / 180;
    const ventoY = Math.cos(rad) * vento * 15;
    
    // ✅ Aplicar ambos os valores CSS
    cloud.style.setProperty('--ventoY', `${ventoY}px`);
	cloud.style.animation = `cloudMove ${ Math.max(15, velocidadeBase - vento) }s linear infinite`;

    cloud.style.opacity = frontal ? 0.55 : 0.35;
    layer.appendChild(cloud);
}

/* =====================================================
   CHUVA (MAIS SENSÍVEL E INTENSA)
===================================================== */
function atualizarChuva() {
    const rain = $("rain");
    rain.innerHTML = "";

    // Probabilidade horária não significa que esteja chovendo agora.
    if (!choveAgora()) return;
    let quantidade = climaAtual.chuva > 0
        ? Math.min(300, Math.max(100, climaAtual.chuva * 60))
        : 120;

    if (modoLeve) quantidade = Math.min(50, quantidade);


    for (let i = 0; i < quantidade; i++) {

    const drop = document.createElement("div");
    drop.className = "drop";
    drop.style.left = Math.random() * 100 + "vw";
    drop.style.top = (-100 - Math.random() * 500) + "px";
    // Gotas mais longas com vento forte
    const altura = 30 + Math.random() * 80 + climaAtual.vento * 2;
    drop.style.height = altura + "px";
    drop.style.width = (1 + Math.random() * 2.5) + "px";
    const duracao = 0.5 + Math.random() * 1.2;
    drop.style.animationDuration = duracao + "s";

    // Direção do vento
    const velocidade = climaAtual.vento;
    const rad = (climaAtual.direcaoVento - 180) * Math.PI / 180;
    // Rajada aleatória
    const rajada = (Math.random() - 0.5) * 80;
    const ventoX = Math.sin(rad) * velocidade * 10 + rajada;

    // Movimento horizontal da gota
    drop.style.setProperty(
        "--ventoX",
        `${ventoX}px`
    );

    // Inclinação visual da gota
    drop.style.setProperty(
        "--angulo",
        `${ventoX * 0.08}deg`
    );

    rain.appendChild(drop);
    }
}

/* =====================================================
   NEBLINA
===================================================== */
function atualizarNeblina() {
    const fog = $("fog");
    if (climaAtual.weatherCode === 45 || climaAtual.weatherCode === 48) {
        fog.style.opacity = 1;
    } else {
        fog.style.opacity = 0;
    }
}

/* =====================================================
   RELÂMPAGOS
===================================================== */
function iniciarRelampagos() {
    setInterval(() => {
        if (modoLeve || document.hidden) return;
        if (
            climaAtual.weatherCode !== 95 &&
            climaAtual.weatherCode !== 96 &&
            climaAtual.weatherCode !== 99
        ) {
            return;
        }
        if (Math.random() > 0.22)
            return;
        relampago();
    }, 15000); // 15 segundos
}

function relampago() {
    const tela = $("lightning");
    tela.style.opacity = 0.95;

	setTimeout(() => {
        tela.style.opacity = 0;
        if (Math.random() > 0.5) {
            setTimeout(() => {
                tela.style.opacity = 0.75;
                setTimeout(() => {
                    tela.style.opacity = 0;
                }, 100);
            }, 120);
        }
    }, 120);
}

/* =====================================================
   SETA VENTO - ROTAÇÃO CONFORME DIREÇÃO
===================================================== */
function atualizarSetaVento() {
    const setaVento = $("setaVento");
    if (!setaVento) return;

    setaVento.style.transform = `rotate(${climaAtual.direcaoVento + 180}deg)`;
}

/* =====================================================
   FASE DA LUA - OBTER ÍCONE 
===================================================== */
const FASES_LUA = [
    ["nova", "Lua nova"],
    ["crescente-fina", "Lua crescente"],
    ["quarto-crescente", "Quarto crescente"],
    ["gibosa-crescente", "Lua gibosa crescente"],
    ["cheia", "Lua cheia"],
    ["gibosa-minguante", "Lua gibosa minguante"],
    ["quarto-minguante", "Quarto minguante"],
    ["minguante-fina", "Lua minguante"]
];

function obterFaseLua(hora) {
    // Converte a hora civil de cada cartão em um instante real para a fase.
    const instante = new Date(dataCidade(hora).getTime() - climaAtual.deslocamentoUTC * 1000);
    const { phase } = astronomiaLocal.getMoonIllumination(instante);
    return FASES_LUA[Math.round(phase * 8) % FASES_LUA.length];
}

/* =====================================================
   WEATHER CODE → ÍCONE
===================================================== */
function obterIcone(codigo, ehDia, hora) {
    const garoa = CODIGOS_GAROA.includes(codigo);
    const chuva = CODIGOS_CHUVA_SEM_TROVAO.includes(codigo);
    if (!ehDia && ([0, 1, 2].includes(codigo) || garoa || chuva)) {
        const [fase, rotulo] = obterFaseLua(hora);
        if (codigo === 0) return svgIcone(`lua-${fase}`, "ldz-weather-icon", rotulo);
        if (garoa || chuva) {
            return svgIcone(`chuva-noite-${fase}`, "ldz-weather-icon",
                `${garoa ? "Garoa" : "Chuva"}, ${rotulo.toLowerCase()}`);
        }
        return svgIcone(`noite-${fase}`, "ldz-weather-icon", `Parcialmente nublado, ${rotulo.toLowerCase()}`);
    }

    let nome, rotulo;
    if (codigo === 0) [nome, rotulo] = ["sol", "Céu limpo"];
    else if ([1, 2].includes(codigo)) [nome, rotulo] = ["parcial", "Parcialmente nublado"];
    else if (codigo === 3) [nome, rotulo] = ["nuvem", "Nublado"];
    else if ([45, 48].includes(codigo)) [nome, rotulo] = ["neblina", "Neblina"];
    else if (garoa) [nome, rotulo] = ["garoa", "Garoa"];
    else if (chuva) [nome, rotulo] = ["chuva", "Chuva"];
    else if ([71, 73, 75, 77].includes(codigo)) [nome, rotulo] = ["neve", "Neve"];
    else if (CODIGOS_TROVOADA.includes(codigo)) [nome, rotulo] = ["trovao", "Trovoada"];
    else [nome, rotulo] = ehDia ? ["parcial", "Parcialmente nublado"] : ["lua", "Noite"];

    return svgIcone(nome, "ldz-weather-icon", rotulo);
}
/* =====================================================
   PREVISÃO 12H (COM DADOS DE PRECIPITAÇÃO)
===================================================== */
function renderizar12Horas(hourly, daily) {
    const container = $("previsao12h");
    const agora = dataCidade(climaAtual.horarioLocal);

    let inicio = hourly.time.findIndex(t => {
        return dataCidade(t) >= agora;
    });
    if (inicio < 0)
        inicio = 0;
    let html = "";
    for (let i = inicio; i < inicio + 12; i++) {
        const hora = hourly.time[i];

        if (!hora) continue;
        const temp = Math.round(hourly.temperature_2m[i]);
        const prob = hourly.precipitation_probability[i] ?? 0;
        const precip = hourly.precipitation[i] || 0;
        const codigo = hourly.weather_code[i];
		
        const indiceDia = daily.time.indexOf(hora.slice(0, 10));
        const nascer = daily.sunrise[indiceDia];
        const por = daily.sunset[indiceDia];
        const minutos = horarioEmMinutos(hora);
        const ehDia = Boolean(nascer && por) &&
            minutos >= horarioEmMinutos(nascer) && minutos <= horarioEmMinutos(por);
        const icone = obterIcone(codigo, ehDia, hora);

        // Formatar informação de chuva
        let infoChuvaCard = "";
        if (precip > 0) {
            infoChuvaCard = `${precip.toFixed(1)}mm - ${prob}%`;
        } else {
            infoChuvaCard = `${prob}%`;
        }

        html += `
        <div class="previsao-card">

            <div class="hora">
                ${hora.slice(11,16)}
            </div>

            <div class="icone">
                ${icone}
            </div>

            <div class="temp">
                ${temp}°
            </div>

            <div class="chuva">
                ${svgIcone("gota")} ${infoChuvaCard}
            </div>

        </div>
        `;
    }

    container.innerHTML = html;
}

/* =====================================================
   EVENTOS
===================================================== */

function atualizarRotuloModo() {
    $("rotuloModo").textContent = `Visual: ${modoLeve ? "leve" : "normal"}`;
    $("btnModo").setAttribute("aria-pressed", String(modoLeve));
    $("btnModo").title = `Alternar para visual ${modoLeve ? "normal" : "leve"}`;
}

$("btnModo").addEventListener("click", () => {
    modoLeve = !modoLeve;
    document.documentElement.classList.toggle("modo-leve", modoLeve);
    atualizarRotuloModo();
    document.querySelectorAll(".meteor").forEach(elemento => elemento.remove());
    $("lightning").style.opacity = 0;
    gerarEstrelas();
    atualizarEstrelas();
    if (climaAtual.horarioLocal) {
        atualizarNuvens();
        atualizarChuva();
        atualizarNeblina();
    }
});

$("btnBuscar").addEventListener("click", buscarCidade);
$("btnGPS").addEventListener("click", usarGPS);
$('btnRefresh').addEventListener('click', () => { window.location.reload(); });

/* =====================================================
   LOOPS
===================================================== */

setInterval(() => {
    if (!document.hidden) atualizarClima();
}, INTERVALO_CLIMA);
// Só reposiciona o disco enquanto a página está visível, sem consultar a rede.
setInterval(atualizarLua, 30000);

document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("pagina-oculta", document.hidden);
    if (!document.hidden) {
        atualizarLua();
        if (Date.now() - ultimaAtualizacao >= INTERVALO_CLIMA) atualizarClima();
    }
});

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

function iniciarSistema() {
    atualizarRotuloModo();
    iniciarGPS();
    atualizarEstrelas();
    iniciarRelampagos();

}
iniciarSistema();
});

