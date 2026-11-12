document.addEventListener("DOMContentLoaded", () => {

/* =====================================================
   ELEMENTOS
===================================================== */
const $ = id => document.getElementById(id);

/* =====================================================
   ESTADO GLOBAL
===================================================== */
let LAT = null;
let LON = null;
let versaoLocalizacao = 0;
let versaoConsultaClima = 0;
let consultaClimaAtiva;
let ultimaAtualizacao = 0;
const INTERVALO_CLIMA = 300000;
const CODIGOS_CHUVA = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];

// Datas da API são horários civis da cidade, sem offset. UTC aqui serve apenas
// como base de comparação, impedindo interferência do fuso do dispositivo.
const dataCidade = valor => new Date(`${valor}Z`);
const horarioEmMinutos = valor => Number(valor.slice(11, 13)) * 60 + Number(valor.slice(14, 16));
const choveAgora = () => climaAtual.chuva > 0 || CODIGOS_CHUVA.includes(climaAtual.weatherCode);

// Mantém o critério anterior e aplica o modo leve a todos os efeitos locais.
const dispositivoAppleMovel = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const modoLeve = !dispositivoAppleMovel &&
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
function iniciarGPS(forcarAtualizacao = false) {
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
            // A API de busca não oferece geocodificação reversa neste endpoint.
            $("cidadeAtual").textContent = `Local atual (${LAT.toFixed(3)}, ${LON.toFixed(3)})`;
            $("cidadeAtual").title = `Precisão estimada: ${Math.round(pos.coords.accuracy || 0)} m`;
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
        const horaAtual = dados.current.time.slice(0, 13);
        const indiceAtual = dados.hourly.time.findIndex(hora => hora.slice(0, 13) === horaAtual);
        climaAtual.temperatura = dados.current.temperature_2m;
        climaAtual.sensacao = dados.current.apparent_temperature;
        climaAtual.umidade = dados.current.relative_humidity_2m;
        climaAtual.vento = dados.current.wind_speed_10m;
        climaAtual.direcaoVento = dados.current.wind_direction_10m || 0;
        climaAtual.chuva = dados.current.precipitation;
        climaAtual.probabilidade = dados.hourly.precipitation_probability[indiceAtual] ?? 0;
        climaAtual.cloudCover = dados.current.cloud_cover;
        climaAtual.weatherCode = dados.current.weather_code;
        climaAtual.sunrise = dados.daily.sunrise[0];
        climaAtual.sunset = dados.daily.sunset[0];
        climaAtual.horarioLocal = dados.current.time;

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
    $("horaLocal").textContent = climaAtual.horarioLocal.slice(11,16);

    // Atualizar seta de vento
    atualizarSetaVento();

    // Atualizar info de precipitação em tempo real
    const infoChuva = $("infoChuvaAtual");
    if (climaAtual.chuva > 0) {
        infoChuva.innerHTML = `💧 <strong>${climaAtual.chuva.toFixed(1)}mm</strong> de chuva`;
        infoChuva.style.display = "block";
    } else if (climaAtual.probabilidade > 0) {
        infoChuva.innerHTML = `💧 ${climaAtual.probabilidade}% de probabilidade`;
        infoChuva.style.display = "block";
    } else {
        infoChuva.style.display = "none";
    }

    if (climaAtual.chuva > 0.5) {
        $("statusChuva").textContent = "🔴 Chuva Forte";
    }
    else if (choveAgora()) {
        $("statusChuva").textContent = "🌧️ Chovendo agora";
    }
    else if (climaAtual.probabilidade > 40) {
        $("statusChuva").textContent = "🟡 Chuva Chegando";
    }
    else if (climaAtual.proximaChuva) {
        $("statusChuva").textContent = "🟡 Chuva nas próximas horas";
    }
    else {
        $("statusChuva").textContent = "🟢 Tempo Estável";
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
        $('descricaoAtual').textContent =
            `🌧️ ${chuvaTotal.toFixed(1)} mm previstos nas próximas 12 horas` +
            (horasComChuva > 0 ? `; possibilidade de chuva em ${horasComChuva} dessas horas` : "");

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
    ++versaoLocalizacao;
    LAT = local.latitude;
    LON = local.longitude;
    campoCidade.value = local.name;
    $("cidadeAtual").removeAttribute("title");
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
   FASE DA LUA / SOL E LUA
===================================================== */
function atualizarFaseVisualLua() {
    const moon = document.querySelector(".moon");

	const hoje = climaAtual.horarioLocal ? dataCidade(climaAtual.horarioLocal) : new Date();
	const referencia = new Date("2024-01-11");
    const dias = (hoje - referencia) / 86400000;
    const ciclo = ((dias % 29.53) + 29.53) % 29.53;
    const fase = ciclo / 29.53;
    const iluminacao = (1 - Math.cos(fase * 2 * Math.PI)) / 2;

    const deslocamento = iluminacao * 110;

    moon.style.setProperty(
        "--fase-lua",
        `${deslocamento}px`
    );
	// só revela depois de calcular
	moon.style.opacity = "";
}

function atualizarSolLua() {
    const sun = document.querySelector(".sun");
    const moon = document.querySelector(".moon");
	atualizarFaseVisualLua();
    const ciclo = calcularPosicaoDiaNoite();
    const cloudFactor = climaAtual.cloudCover / 100;

    if (ciclo.ehDia) {
        // Sol
        const p = ciclo.progresso;
        const x = 5 + (p * 90);
        const y = 78 - (Math.sin(p * Math.PI) * 65);

        sun.style.left = x + "vw";
        sun.style.top = y + "vh";
        sun.style.opacity = Math.max(0.25, 1 - (cloudFactor * 0.65));
        sun.style.filter = `brightness(${1.2 - cloudFactor * 0.5})`;
        moon.style.opacity = 0;
    }
    else {
        // Lua
        let moonStart = ciclo.por;
        let moonEnd = ciclo.nascer + 86400000;

        if (ciclo.tempoAtual < ciclo.nascer) {
            moonStart = ciclo.por - 86400000;
            moonEnd = ciclo.nascer;
        }

        const p = (ciclo.tempoAtual - moonStart) / (moonEnd - moonStart);
        const x = 5 + (p * 90);
        const y = 78 - (Math.sin(p * Math.PI) * 65);

        moon.style.left = x + "vw";
        moon.style.top = y + "vh";
        moon.style.opacity = Math.max(0.15, 0.85 - (cloudFactor * 0.6));
        sun.style.opacity = 0;
    }
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

if (!modoLeve) setInterval(() => {
    if (document.hidden || !climaAtual.sunrise) return;
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
    if (modoLeve) return;
    setInterval(() => {
        if (document.hidden) return;
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
function obterFaseLua(hora) {

    const hoje = hora ? dataCidade(hora) : obterHoraCidade();
    const referencia = new Date("2024-01-11");
    const dias = (hoje - referencia) / 86400000;
    const ciclo = ((dias % 29.53) + 29.53) % 29.53;

    if (ciclo < 1.8) return "🌑";
    if (ciclo < 5.5) return "🌒";
    if (ciclo < 9.2) return "🌓";
    if (ciclo < 12.9) return "🌔";
    if (ciclo < 16.6) return "🌕";
    if (ciclo < 20.3) return "🌖";
    if (ciclo < 24.0) return "🌗";

    return "🌘";
}

/* =====================================================
   WEATHER CODE → ÍCONE
===================================================== */
function obterIcone(codigo, ehDia, hora) {

    // Céu limpo
    if (codigo === 0) return ehDia ? "☀️" : obterFaseLua(hora);
	
    // Poucas nuvens
    if ([1, 2].includes(codigo)) return ehDia ? "🌤️" : `${obterFaseLua(hora)}☁️`;

    // Nublado
    if (codigo === 3) return "☁️";

    // Neblina
    if ([45, 48].includes(codigo)) return "🌫️";

    // Garoa
    if ([51,53,55,56,57].includes(codigo)) return "🌦️";

    // Chuva
    if ([61,63,65,66,67].includes(codigo)) return "🌧️";

    // Neve
    if ([71,73,75,77].includes(codigo)) return "❄️";

    // Pancadas
    if ([80,81,82].includes(codigo)) return "🌧️";

    // Tempestade
    if ([95,96,99].includes(codigo)) return "⛈️";

    return ehDia ? "🌤️" : "🌙";
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
                💧 ${infoChuvaCard}
            </div>

        </div>
        `;
    }

    container.innerHTML = html;
}

/* =====================================================
   EVENTOS
===================================================== */

$("btnBuscar").addEventListener("click", buscarCidade);
$("btnGPS").addEventListener("click", usarGPS);
$('btnRefresh').addEventListener('click', () => { window.location.reload(); });

/* =====================================================
   LOOPS
===================================================== */

setInterval(() => {
    if (!document.hidden) atualizarClima();
}, INTERVALO_CLIMA);

document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("pagina-oculta", document.hidden);
    if (!document.hidden && Date.now() - ultimaAtualizacao >= INTERVALO_CLIMA) atualizarClima();
});

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

function iniciarSistema() {
    iniciarGPS();
    atualizarEstrelas();
    iniciarRelampagos();

}
iniciarSistema();
});
