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
let timezoneAtual = "";

let climaAtual = {
    temperatura: 0,
    sensacao: 0,
    umidade: 0,
    vento: 0,
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
    return new Date(climaAtual.horarioLocal);
}

/* =====================================================
   CALCULA POSIÇÃO NO CICLO DIA/NOITE
===================================================== */
function calcularPosicaoDiaNoite() {
    const agora = obterHoraCidade().getTime();
    const nascer = new Date(climaAtual.sunrise).getTime();
    const por = new Date(climaAtual.sunset).getTime();
    
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
async function atualizarNomeCidade() {
    console.log("🔍 Iniciando atualizarNomeCidade com LAT:", LAT, "LON:", LON);
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${LAT}&longitude=${LON}&language=pt`;
        console.log("📍 URL de reverse geocoding:", url);

        const resposta = await fetch(url);
        
        if (!resposta.ok) {
            console.error("❌ Erro HTTP:", resposta.status);
            throw new Error(`Erro HTTP ${resposta.status}`);
        }
        const dados = await resposta.json();
        console.log("✅ Reverse Geocoding OK:", dados);
        
        if (dados.results && dados.results.length > 0) {
            const local = dados.results[0];
            const cidade = local.name || "";
            const estado = local.admin1 || "";
            
            console.log("🏙️ Cidade encontrada:", cidade, estado);
            $("cidadeAtual").textContent = [cidade, estado].filter(Boolean).join(", ");
        } else {
            console.warn("⚠️ Nenhum resultado de geocoding");
            $("cidadeAtual").textContent = `${LAT.toFixed(2)}, ${LON.toFixed(2)}`;
        }
    }
    catch (erro) {
        console.error("❌ Erro ao obter cidade:", erro);
        $("cidadeAtual").textContent = `${LAT.toFixed(2)}, ${LON.toFixed(2)}`;
    }
}

function iniciarGPS() {
    $("cidadeAtual").textContent =
        "Buscando localização...";
    if (!navigator.geolocation) {
        $("cidadeAtual").textContent =
            "GPS não suportado. Busque manualmente";
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async pos => {
            LAT = pos.coords.latitude;
            LON = pos.coords.longitude;
            console.log("LAT:", LAT);
            console.log("LON:", LON);
			
            await atualizarNomeCidade();
            await atualizarClima();
        },
        erro => {
            console.error("Erro GPS:", erro);
            $("cidadeAtual").textContent =
                "Permissão negada";
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/* =====================================================
     OPEN METEO
===================================================== */
async function atualizarClima() { 
    if (LAT === null || LON === null)
        return;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,cloud_cover,weather_code&daily=sunrise,sunset,weather_code&hourly=temperature_2m,precipitation,precipitation_probability,weather_code&timezone=auto`;
        const resposta = await fetch(url);
        const dados = await resposta.json();
		console.log("URL:", url);
		console.log("Resposta Raw:", dados);

        timezoneAtual = dados.timezone;
        climaAtual.temperatura = dados.current.temperature_2m;
        climaAtual.sensacao = dados.current.apparent_temperature;
        climaAtual.umidade = dados.current.relative_humidity_2m;
        climaAtual.vento = dados.current.wind_speed_10m;
        climaAtual.chuva = dados.current.precipitation;
        climaAtual.probabilidade = dados.current.precipitation_probability;
        climaAtual.cloudCover = dados.current.cloud_cover;
        climaAtual.weatherCode = dados.current.weather_code;
        climaAtual.sunrise = dados.daily.sunrise[0];
        climaAtual.sunset = dados.daily.sunset[0];
        climaAtual.horarioLocal = dados.current.time;

		atualizarInterface();
        atualizarMapa();
        renderizar12Horas(dados.hourly);
        atualizarDescricao(dados.hourly);
        atualizarCeu();
        atualizarSolLua();
        atualizarNuvens();
        atualizarChuva();
        atualizarNeblina();
        atualizarEstrelas();
        atualizarViaLactea();
    }
    catch (erro) {
        console.error(erro);
    }
}

/* =====================================================
   INTERFACE
===================================================== */
function atualizarInterface() {
    $("tempAtual").textContent = Math.round(climaAtual.temperatura) + "°";
    $("sensacaoAtual").textContent = Math.round(climaAtual.sensacao) + "°";
    $("umidadeAtual").textContent = climaAtual.umidade + "%";
    $("ventoAtual").textContent = Math.round(climaAtual.vento) + " km/h";
    $("sunrise").textContent = climaAtual.sunrise.slice(11,16);
    $("sunset").textContent = climaAtual.sunset.slice(11,16);
    $("horaLocal").textContent = climaAtual.horarioLocal.slice(11,16);

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
    // Calcula precipitação e probabilidade para as próximas 12 horas
    let chuvaTotal = 0;
    let horasComChuva = 0;
    let primeiraHoraComChuva = -1;
    
    for (let i = 0; i < 12; i++) {
        const prob = (h.precipitation_probability[i] || 0);
        const amount = (h.precipitation[i] || 0);
        
        if (prob > 20 || amount > 0.5) {
            chuvaTotal += amount;
            horasComChuva++;
            if (primeiraHoraComChuva === -1) {
                primeiraHoraComChuva = i;
            }
        }
    }

    // Exibir descrição baseada na previsão
    if (primeiraHoraComChuva >= 0 && horasComChuva > 0) {
        $('descricaoAtual').textContent = `🌧️ Chuva de ${chuvaTotal.toFixed(1)}mm nas próximas ${horasComChuva}h`;
        climaAtual.proximaChuva = true;
    } else {
        $('descricaoAtual').textContent = "Sem chuva nas próximas horas";
        climaAtual.proximaChuva = false;
    }
}

/* =====================================================
   RADAR
===================================================== */
function atualizarMapa() {
    $("mapaRadar").src = `https://www.rainviewer.com/map.html?loc=${LAT},${LON},10&oFa=0&layer=radar`;
}

/* =====================================================
   BUSCA DE CIDADE
===================================================== */
async function buscarCidade() {
    const nome = $("cidade").value.trim();

    if (!nome) return;
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt`;
    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (!dados.results?.length)
        return;
    LAT = dados.results[0].latitude;
    LON = dados.results[0].longitude;

    $("cidadeAtual").textContent = dados.results[0].name;
    atualizarClima();
    atualizarDescrição();
    atualizarEstrelas();
}

function usarGPS() {
    iniciarGPS();
    atualizarDescrição();
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
   SOL E LUA
===================================================== */
function atualizarSolLua() {
    const sun = document.querySelector(".sun");
    const moon = document.querySelector(".moon");
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
    const total = 400;

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
        layer.appendChild(star);
    }
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
   VIA LÁCTEA
===================================================== */
function atualizarViaLactea() {
    const milky = $("milkyway");
    const ciclo = calcularPosicaoDiaNoite();
    const cloud = climaAtual.cloudCover;

    // Via láctea apenas à noite e com poucas nuvens
    if (!ciclo.ehDia && cloud < 10) {
        milky.style.opacity = 0.5;
    }
    else {
        milky.style.opacity = 0;
    }
}

/* =====================================================
   ESTRELA CADENTE
===================================================== */
function criarEstrelaCadente() {

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
    atualizarCeu();
    atualizarSolLua();
    atualizarEstrelas();
    atualizarViaLactea();
}, 30000); // 30 seg

/* =====================================================
   NUVENS
===================================================== */

function atualizarNuvens() {
    const back = $("cloudBack");
    const front = $("cloudFront");

    back.innerHTML = "";
    front.innerHTML = "";

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
    cloud.style.animation = `cloudMove ${ velocidadeBase - vento }s linear infinite`;

    cloud.style.opacity = frontal ? 0.55 : 0.35;
    layer.appendChild(cloud);
}

/* =====================================================
   CHUVA (MAIS SENSÍVEL E INTENSA)
===================================================== */
function atualizarChuva() {
    const rain = $("rain");
    rain.innerHTML = "";

    // Verifica se há chuva:
    // 1. Se precipitation > 0 (chovendo agora)
    // 2. OU se precipitation_probability > 15% (alta chance)
    // 3. OU se weather code indica chuva/tempestade
    const temChuvaAgora = climaAtual.chuva > 0;
    const altaProbabilidade = climaAtual.probabilidade > 15;
    const ehChuvaCodigo = [
        51, 53, 55, 56, 57,  // Garoa
        61, 63, 65, 66, 67,  // Chuva
        80, 81, 82,          // Chuva por pancada
        95, 96, 99           // Tempestade
    ].includes(climaAtual.weatherCode);

    if (!temChuvaAgora && !altaProbabilidade && !ehChuvaCodigo) {
        return;  // Nenhuma chuva esperada
    }

    // Calcula quantidade de gotas com base em:
    // - Precipitação atual (mais forte = mais gotas)
    // - Probabilidade
    // - Weather code
    let quantidade = 0;
    
    if (temChuvaAgora) {
        // Se está chovendo, quantidade baseada na precipitação em mm
        // 1mm = ~80 gotas, 2mm = ~150, 5mm = ~250
        quantidade = Math.min(300, Math.max(100, climaAtual.chuva * 60));
    } else if (altaProbabilidade) {
        // Se há alta probabilidade, escala com a probabilidade
        // 15% = 60 gotas, 50% = 200 gotas, 100% = 300 gotas
        quantidade = Math.min(300, Math.max(60, climaAtual.probabilidade * 4));
    } else if (ehChuvaCodigo) {
        // Se é um código de chuva mas sem probabilidade/precipitação clara
        quantidade = Math.min(250, Math.max(120, climaAtual.probabilidade * 3 + 80));
    }

    console.log(`🌧️ Chuva renderizada: ${Math.round(quantidade)} gotas (chuva: ${climaAtual.chuva}mm, prob: ${climaAtual.probabilidade}%, código: ${climaAtual.weatherCode})`);

    for (let i = 0; i < quantidade; i++) {
        const drop = document.createElement("div");
        drop.className = "drop";
        drop.style.left = Math.random() * 100 + "vw";
        drop.style.top = (-100 - Math.random() * 500) + "px";
        drop.style.height = (30 + Math.random() * 120) + "px";
        drop.style.width = (1 + Math.random() * 2.5) + "px";

        const duracao = 0.5 + Math.random() * 1.2;
        drop.style.animationDuration = duracao + "s";

        const inclinacao = climaAtual.vento * 1.1;
        drop.style.transform = `rotate(${inclinacao}deg)`;
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
   WEATHER CODE → ÍCONE
===================================================== */
function obterIcone(codigo) {
    if (codigo === 0)
        return "☀️";

    if ([1, 2, 3].includes(codigo))
        return "🌤️";

    if ([45, 48].includes(codigo))
        return "🌫️";

    if ([51,53,55,56,57].includes(codigo))
        return "🌦️";

    if ([61,63,65,66,67].includes(codigo))
        return "🌧️";

    if ([71,73,75,77].includes(codigo))
        return "❄️";

    if ([80,81,82].includes(codigo))
        return "🌧️";

    if ([95,96,99].includes(codigo))
        return "⛈️";

    return "☁️";
}

/* =====================================================
   PREVISÃO 12H (COM DADOS DE PRECIPITAÇÃO)
===================================================== */
function renderizar12Horas(hourly) {
    const container = $("previsao12h");
    const agora = new Date(climaAtual.horarioLocal);

    let inicio = hourly.time.findIndex(t => {
        return new Date(t) >= agora;
    });
    if (inicio < 0)
        inicio = 0;
    let html = "";
    for (let i = inicio; i < inicio + 12; i++) {
        const hora = hourly.time[i];

        if (!hora) continue;
        const temp = Math.round(hourly.temperature_2m[i]);
        const prob = hourly.precipitation_probability[i];
        const precip = hourly.precipitation[i] || 0;
        const codigo = hourly.weather_code[i];
        const icone = obterIcone(codigo);

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
    atualizarClima();
}, 300000); // 5 min

setInterval(() => {
    atualizarEstrelas();
    atualizarViaLactea();
}, 60000); // 1 min

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

function iniciarSistema() {
    iniciarGPS();
    atualizarDescrição();
    gerarEstrelas();
    atualizarEstrelas();
    iniciarRelampagos();

}
iniciarSistema();
});
