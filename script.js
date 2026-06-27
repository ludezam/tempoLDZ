document.addEventListener("DOMContentLoaded", () => {

  // ================= CONFIGURAÇÃO =================
  let LAT = -20.8113;
  let LON = -49.3758;
  let nomeCidadeAtual = "São José do Rio Preto-SP";

  // ================= ELEMENTOS =================
  const mapaRadarEl = document.getElementById("mapaRadar");

  const cidadeInput = document.getElementById("cidade");
  const btnBuscar = document.getElementById("btnBuscar");
  const btnGPS = document.getElementById("btnGPS");
  const btnRefresh = document.getElementById("btnRefresh");
  const previsao12hEl = document.getElementById("previsao12h");

  // ================= EVENTOS =================
  btnBuscar.addEventListener("click", buscarCidade);
  btnGPS.addEventListener("click", usarGPS);
  btnRefresh.addEventListener("click", () => window.location.reload());

  // ================= FUNÇÕES =================
  const UF_POR_ESTADO = {
    Acre: "AC",
    Alagoas: "AL",
    Amapá: "AP",
    Amazonas: "AM",
    Bahia: "BA",
    Ceará: "CE",
    "Distrito Federal": "DF",
    "Espírito Santo": "ES",
    Goiás: "GO",
    Maranhão: "MA",
    "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG",
    Pará: "PA",
    Paraíba: "PB",
    Paraná: "PR",
    Pernambuco: "PE",
    Piauí: "PI",
    "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS",
    Rondônia: "RO",
    Roraima: "RR",
    "Santa Catarina": "SC",
    "São Paulo": "SP",
    Sergipe: "SE",
    Tocantins: "TO"
  };

  function formatarNomeCidade({ name, admin1, country_code }) {
    if (!name) return "Local atual";

    if (country_code === "BR" && admin1) {
      const uf = UF_POR_ESTADO[admin1] || admin1;
      return `${name}-${uf}`;
    }

    if (admin1) return `${name}-${admin1}`;
    return name;
  }

  function mostrarCidade(nome) {
    nomeCidadeAtual = nome;
  }

  function atualizarMapa(nomeCidade = nomeCidadeAtual) {
    if (!mapaRadarEl) return;

    mapaRadarEl.src = `https://www.rainviewer.com/map.html?loc=${LAT},${LON},10&oCS=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`;
    mapaRadarEl.title = `Mapa radar de ${nomeCidade}`;
  }

  async function obterNomeCidadePorCoordenadas(latitude, longitude) {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=pt`
    );

    if (!r.ok) {
      throw new Error("Falha ao obter cidade");
    }

    const data = await r.json();
    const resultado = data.results?.[0];

    if (!resultado?.name) {
      throw new Error("Cidade não encontrada para as coordenadas");
    }

    return formatarNomeCidade(resultado);
  }

  function temChuvaPrevista(prob, precip) {
    return (Number.isFinite(precip) && precip > 0) || (Number.isFinite(prob) && prob >= 40);
  }

  function grauNebulosidade(cloudCover) {
    if (!Number.isFinite(cloudCover)) return null;
    if (cloudCover >= 70) return "muito";
    if (cloudCover >= 35) return "pouco";
    return null;
  }

  function iconePorClima({ prob, precip, temp, cloudCover }) {
    if (Number.isFinite(temp) && temp < 15) return "❄️";

    if (temChuvaPrevista(prob, precip)) {
      if (Number.isFinite(precip) && precip >= 4) return "⛈️";
      if (Number.isFinite(precip) && precip >= 1) return "🌧️";
      return "🌦️";
    }

    const nebulosidade = grauNebulosidade(cloudCover);
    if (nebulosidade === "muito") return "☁️";
    if (nebulosidade === "pouco") return "🌥️";

    if (Number.isFinite(temp) && temp >= 35) return "🔥";
    if (Number.isFinite(temp) && temp > 28 && temp <= 34) return "☀️";
    if (Number.isFinite(temp) && temp >= 16 && temp <= 28) return "🌤️";

    return "☁️";
  }

  function periodoLuzDoDia(time) {
    const hora = Number(time?.slice(11, 13));

    if (!Number.isFinite(hora)) return null;
    if (hora >= 5 && hora < 7) return "amanhecer";
    if (hora >= 17 && hora < 19) return "anoitecer";
    if (hora >= 19 || hora < 5) return "noite";

    return null;
  }

  function classeCardPorPeriodo(periodo) {
    return periodo ? ` previsao-card--${periodo}` : "";
  }

  function ilustracaoPorPeriodo(periodo) {
    if (periodo === "amanhecer") {
      return '<div class="ilustracao-periodo ilustracao-periodo--amanhecer" aria-hidden="true"><span></span><span></span><span></span></div>';
    }

    if (periodo === "anoitecer") {
      return '<div class="ilustracao-periodo ilustracao-periodo--anoitecer" aria-hidden="true"><span></span><span></span><span></span></div>';
    }

    if (periodo === "noite") {
      return '<div class="ilustracao-periodo ilustracao-periodo--noite" aria-hidden="true"><span></span><span></span><span></span><span></span></div>';
    }

    return "";
  }

  function classeCardPorClima({ prob, precip, temp, cloudCover }) {
    if (Number.isFinite(temp) && temp < 15) return " previsao-card--frio";

    if (temChuvaPrevista(prob, precip)) {
      if (Number.isFinite(precip) && precip >= 4) return " previsao-card--chuva-forte";
      if (Number.isFinite(precip) && precip >= 1) return " previsao-card--chuva-moderada";
      return " previsao-card--chuva-fraca";
    }

    const nebulosidade = grauNebulosidade(cloudCover);
    if (nebulosidade === "muito") return " previsao-card--muito-nublado";
    if (nebulosidade === "pouco") return " previsao-card--pouco-nublado";

    if (Number.isFinite(temp) && temp >= 35) return " previsao-card--calor-extremo";
    if (Number.isFinite(temp) && temp > 28 && temp <= 34) return " previsao-card--sol";
    if (Number.isFinite(temp) && temp >= 16 && temp <= 28) return " previsao-card--ameno";

    return "";
  }

  function ilustracaoPorClima({ prob, precip, temp, cloudCover }) {
    if (Number.isFinite(temp) && temp < 15) {
      return '<div class="ilustracao-frio" aria-hidden="true"><span>❄</span><span>✦</span><span>❅</span></div>';
    }

    if (temChuvaPrevista(prob, precip)) {
      return '<div class="ilustracao-chuva" aria-hidden="true"><span></span><span></span><span></span></div>';
    }

    const nebulosidade = grauNebulosidade(cloudCover);
    if (nebulosidade) {
      return `<div class="ilustracao-nublado ilustracao-nublado--${nebulosidade}" aria-hidden="true"><span></span><span></span><span></span></div>`;
    }

    if (Number.isFinite(temp) && temp >= 35) {
      return '<div class="ilustracao-calor" aria-hidden="true"><span>🔥</span><span></span></div>';
    }

    if (Number.isFinite(temp) && temp > 28 && temp <= 34) {
      return '<div class="ilustracao-sol" aria-hidden="true"><span>☀</span></div>';
    }

    if (Number.isFinite(temp) && temp >= 16 && temp <= 28) {
      return '<div class="ilustracao-ameno" aria-hidden="true"><span></span><span></span><span></span></div>';
    }

    return "";
  }

  function formatarVelocidadeVento(velocidade) {
    if (!Number.isFinite(velocidade)) return "-- km/h";
    return `${velocidade.toFixed(0)} km/h`;
  }

  function formatarDirecaoVento(direcao) {
    if (!Number.isFinite(direcao)) return "direção indisponível";
    return `${Math.round(direcao)}°`;
  }

  function obterChaveHoraAtual(timeZone = "America/Sao_Paulo") {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    }).formatToParts(agora);

    const mapa = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:00`;
  }

  function renderizarPrevisao12h(hourly, timeZone) {
    if (!previsao12hEl || !hourly?.time) return;

    const chaveHoraAtual = obterChaveHoraAtual(timeZone);
    const indiceInicial = Math.max(hourly.time.findIndex(time => time >= chaveHoraAtual), 0);

    const proximas12 = hourly.time.slice(indiceInicial, indiceInicial + 12).map((time, i) => ({
      time,
      temp: hourly.temperature_2m[indiceInicial + i],
      precip: hourly.precipitation[indiceInicial + i],
      prob: hourly.precipitation_probability[indiceInicial + i],
      windSpeed: hourly.wind_speed_10m[indiceInicial + i],
      windDirection: hourly.wind_direction_10m[indiceInicial + i],
      cloudCover: hourly.cloud_cover?.[indiceInicial + i]
    }));

    previsao12hEl.innerHTML = proximas12.map(item => {
      const horario = item.time.slice(11, 16);

      const clima = { prob: item.prob, precip: item.precip, temp: item.temp, cloudCover: item.cloudCover };
      const periodo = periodoLuzDoDia(item.time);
      const classeClima = classeCardPorClima(clima);
      const classePeriodo = classeCardPorPeriodo(periodo);

      return `
        <article class="previsao-card${classeClima}${classePeriodo}" role="listitem" aria-label="Previsão para ${horario}, temperatura ${item.temp.toFixed(0)}°C, vento ${formatarVelocidadeVento(item.windSpeed)} na direção ${formatarDirecaoVento(item.windDirection)}">
          ${ilustracaoPorClima(clima)}
          ${ilustracaoPorPeriodo(periodo)}
          <div class="hora">${horario}</div>
          <div class="icone-clima">${iconePorClima(clima)}</div>
          <div class="temperatura">${item.temp.toFixed(0)}°C</div>
          <div class="chuva">${item.prob}% · ${item.precip.toFixed(1)} mm</div>
          <div class="vento-card" aria-label="Vento ${formatarVelocidadeVento(item.windSpeed)} na direção ${formatarDirecaoVento(item.windDirection)}">
            <span class="seta-vento" style="--direcao-vento: ${Number.isFinite(item.windDirection) ? item.windDirection : 0}deg" aria-hidden="true">↑</span>
            <span class="velocidade-vento">${formatarVelocidadeVento(item.windSpeed)}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  async function buscarCidade() {
    try {
      const nome = cidadeInput.value.trim();
      if (!nome) throw "Digite a cidade";

      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt`
      );

      if (!r.ok) throw "Erro ao buscar cidade";

      const data = await r.json();
      if (!data.results) throw "Cidade não encontrada";

      LAT = data.results[0].latitude;
      LON = data.results[0].longitude;

      const nomeCidade = formatarNomeCidade(data.results[0]);
      mostrarCidade(nomeCidade);
      atualizarMapa(nomeCidade);
      atualizarTudo();
    } catch (e) {
      console.error("Erro ao buscar cidade:", e);
    }
  }

  function usarGPS() {
    carregarLocalizacaoAtual({ mostrarErro: true });
  }

  function carregarLocalizacaoAtual({ mostrarErro = false } = {}) {
    if (!navigator.geolocation) {
      if (mostrarErro) {
        console.warn("Geolocalização não suportada");
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(async pos => {
      LAT = pos.coords.latitude;
      LON = pos.coords.longitude;

      let nomeCidade = nomeCidadeAtual;

      try {
        nomeCidade = await obterNomeCidadePorCoordenadas(LAT, LON);
      } catch (erro) {
        console.error("Erro ao resolver cidade da localização:", erro);
      }

      mostrarCidade(nomeCidade);
      atualizarMapa(nomeCidade);
      atualizarTudo();
    }, erro => {
      console.warn("Não foi possível obter a localização automaticamente:", erro);
      if (mostrarErro) {
        console.warn("Permissão de localização negada");
      }
    }, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 10000
    });
  }

  async function atualizarPrevisao() {
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=precipitation_probability,precipitation,temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`
      );

      if (!r.ok) throw "Erro na previsão";

      const data = await r.json();
      renderizarPrevisao12h(data.hourly, data.timezone);

    } catch (e) {
      console.error("Erro atualizarPrevisao:", e);
    }
  }

  function atualizarTudo() {
    atualizarPrevisao();
  }

  // ================= INICIALIZAÇÃO =================
  mostrarCidade(nomeCidadeAtual);
  atualizarMapa(nomeCidadeAtual);
  atualizarTudo();
  carregarLocalizacaoAtual();

});
