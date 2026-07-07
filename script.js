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
    horarioLocal: null
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
   GEOLOCALIZAÇÃO
===================================================== */
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

async function atualizarNomeCidade() {
    try {
        const url =`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${LAT}&longitude=${LON}&language=pt`;

        const resposta = await fetch(url);

        if (!resposta.ok) {
            throw new Error(`Erro HTTP ${resposta.status}`);
        }
        const dados = await resposta.json();
        console.log("Reverse Geocoding:", dados);
		
        if (dados.results && dados.results.length > 0 ) {
            const local = dados.results[0];
            const cidade = local.name || "";
            const estado = local.admin1 || "";
            const pais = local.country || "";

            $("cidadeAtual").textContent = [cidade, estado].filter(Boolean).join(", ");
        }
        else {
            $("cidadeAtual").textContent = `${LAT.toFixed(2)}, ${LON.toFixed(2)}`;
        }
    }
    catch (erro) {
        console.error("Erro ao obter cidade:", erro);
        $("cidadeAtual").textContent = `${LAT.toFixed(2)}, ${LON.toFixed(2)}`;
    }
}

/* =====================================================
   OPEN METEO
===================================================== */
async function atualizarClima() { 
    if (LAT === null || LON === null)
        return;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,cloud_cover,weather_code&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover&daily=sunrise,sunset&timezone=auto`;		
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

    if (climaAtual.chuva > 5) {
        $("statusChuva").textContent = "🔴 Chuva Forte";
    }
    else if (climaAtual.probabilidade > 60) {
        $("statusChuva").textContent = "🟡 Chuva Chegando";
    }
    else {
        $("statusChuva").textContent = "🟢 Tempo Estável";
    }
}

/* =====================================================
   ATUALIZAR DESCRIÇÃO
===================================================== */
function atualizarDescricao(h) {

  for (let i = 0; i < 6; i++) {
    if ((h.precipitation_probability[i] || 0) > 60) {
      el("descricaoAtual").textContent = `🌧️ Chuva em ${i + 1}h`;
      return;
    }
  }
  el("descricaoAtual").textContent = "Sem chuva nas próximas horas";
}

/* =====================================================
   RADAR
===================================================== */
function atualizarMapa() {
    $("mapaRadar").src = `https://www.rainviewer.com/map.html?loc=${LAT},${LON},8&oFa=0&layer=radar`;
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
    atualizarEstrelas();
}

function usarGPS() {
    iniciarGPS();
}
/* =====================================================
   CÉU DINÂMICO
===================================================== */
function atualizarCeu() {
    const sky = document.getElementById("sky");
    const agora = obterHoraCidade();
    const hora = agora.getHours() + (agora.getMinutes() / 60);
    let gradiente = "";

    if (hora >= 5 && hora < 7) {
        gradiente = `linear-gradient(180deg, #ff8030 0%, #ffc26f 35%, #8ddcff 100%)`;
    }
    else if (hora >= 7 && hora < 12) {
        gradiente = `linear-gradient(180deg, #6dbfff 0%, #bce7ff 100%)`;
    }
    else if (hora >= 12 && hora < 17) {
        gradiente = `linear-gradient(180deg, #4ea5ff 0%, #82d4ff 100%)`;
    }
    else if (hora >= 17 && hora < 19) {
        gradiente = `linear-gradient(180deg,#ff8a38 0%, #ffc061 30%, #3f6ed7 100%)`;
    }
    else {
        gradiente = `linear-gradient(180deg,#020611 0%,#071028 100%)`;
    }
    sky.style.background = gradiente;
}

/* =====================================================
   SOL E LUA
===================================================== */
function atualizarSolLua() {
    const sun = document.querySelector(".sun");
    const moon = document.querySelector(".moon");
    const agora = obterHoraCidade();
    const now = agora.getTime();
    const sunrise = new Date(climaAtual.sunrise).getTime();
    const sunset = new Date(climaAtual.sunset).getTime();
    const cloudFactor = climaAtual.cloudCover / 100;

    if (now >= sunrise && now <= sunset) {
        const p = (now - sunrise) / (sunset - sunrise);
        const x = 5 + (p * 90);
        const y = 78 - (Math.sin(p * Math.PI) * 65);

        sun.style.left = x + "vw";
        sun.style.top = y + "vh";
        sun.style.opacity = Math.max(0.25, 1 - (cloudFactor * 0.65));
        sun.style.filter = `brightness(${1.2 - cloudFactor * 0.5})`;
        moon.style.opacity = 0;
    }
    else {
        let moonStart = sunset;
        let moonEnd = sunrise + 86400000;

        if (now < sunrise) {
            moonStart = sunset - 86400000;
            moonEnd = sunrise;
        }
        const p = (now - moonStart) / (moonEnd - moonStart);
        const x = 5 + (p * 90);

        const y = 78 - (Math.sin(p * Math.PI) * 65);
        moon.style.left = x + "vw";
        moon.style.top = y + "vh";
        moon.style.opacity = Math.max(0.15,0.85 - (cloudFactor * 0.6));
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

    const agora = obterHoraCidade().getTime();
    const nascer = new Date(climaAtual.sunrise).getTime();
    const por = new Date(climaAtual.sunset).getTime();

    const ehDia = agora >= nascer && agora <= por;

    if (ehDia) {
        stars.style.opacity = 0;
		document.body.style.color = "#10438f";
        return;
    }
    const cloud = (climaAtual.cloudCover || 0) / 100;

    stars.style.opacity = Math.max(0.15, 1 - cloud);
	document.body.style.color = "#fff";
}

/* =====================================================
   VIA LÁCTEA
===================================================== */
function atualizarViaLactea() {
    const milky = $("milkyway");

    const hora = obterHoraCidade().getHours();
    const cloud = climaAtual.cloudCover;

    if (
        (hora >= 21 || hora <= 4) && cloud < 10) {
        milky.style.opacity = 0.35;
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
    const hora = obterHoraCidade().getHours();

    if (hora > 5 && hora < 19)
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
    const hora = obterHoraCidade().getHours();
    if (hora >= 6 && hora < 18)
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
}, 60000); // 1 min

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
   CHUVA
===================================================== */
function atualizarChuva() {
    const rain = $("rain");
    rain.innerHTML = "";

    if (climaAtual.chuva <= 0 && climaAtual.probabilidade < 40) {
        return;
    }

    const quantidade = Math.min(125, Math.max(24, climaAtual.probabilidade));

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
   PREVISÃO 12H
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
        const codigo = hourly.weather_code[i];
        const icone = obterIcone(codigo);

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
                ${prob}% chuva
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
$(“btnRefresh”).addEventListener(“click”, () => { window.location.reload(); });

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
    gerarEstrelas();
    atualizarEstrelas();
    iniciarRelampagos();
    iniciarGPS();
}
iniciarSistema();
});
