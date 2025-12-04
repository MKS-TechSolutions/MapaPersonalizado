// =================================================================
// 1. VARIÁVEIS DE CONFIGURAÇÃO E DADOS
// =================================================================

const CENTRO_MAPA = [-30.0328, -51.2304]; 
const ZOOM_INICIAL = 7; 

// 🚨 LINK CORRIGIDO E INSERIDO AUTOMATICAMENTE A PARTIR DA SUA PLANILHA!
const URL_DADOS_MESTRA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCaSRtV1pgSer6EXDV1NfUW4NEl3mcY6d-fjiIld4jqz4X9HZAzLarap4BStAZTpALIUnzNZ9Z0Eoz/pub?output=csv'; 

const URL_OSRM = 'https://router.project-osrm.org/route/v1/driving/'; 

let dadosPedagios = [];
let dadosObras = [];
let dadosViasDuplas = []; 
let rotaAtualLayer; 


// =================================================================
// 2. INICIALIZAÇÃO DO MAPA (LEAFLET/OSM)
// =================================================================

const map = L.map('mapa-customizado').setView(CENTRO_MAPA, ZOOM_INICIAL);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
}).addTo(map);


// =================================================================
// 3. DEFINIÇÃO DOS ÍCONES CUSTOMIZADOS
// =================================================================

const IconePedagio = L.icon({
    iconUrl: './assets/icons/icon-pedagio.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const IconeObra = L.icon({
    iconUrl: './assets/icons/icon-obra.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const IconeViaDupla = L.icon({
    iconUrl: './assets/icons/icon-caminhao.png', 
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -20]
});


// =================================================================
// 4. FUNÇÕES DE VISUALIZAÇÃO E DADOS
// =================================================================

function construirPopup(data) {
    const tipo = (data.TIPO || 'desconhecido').toLowerCase();
    let html = `<h4>${data.NOME}</h4>`;
    
    const eixo12 = parseFloat(data.EIXO_1_2);
    const eixoAdicional = parseFloat(data.EIXO_ADICIONAL);
    const impacto = data.IMPACTO;

    if (tipo === 'pedagio') {
        html += `<p>Rodovia: ${data.RODOVIA}</p>`;
        if (!isNaN(eixo12)) html += `<p>Tarifa Base (2 Eixos): R$ ${eixo12.toFixed(2)}</p>`;
        if (!isNaN(eixoAdicional)) html += `<p>Eixo Adicional: R$ ${eixoAdicional.toFixed(2)}</p>`;
    } else if (tipo === 'obra') {
        html += `<p>Rodovia: ${data.RODOVIA}</p>`;
        html += `<p>Descrição: ${data.DESCRICAO}</p>`;
        html += `<p style="color: ${impacto && impacto.includes('Total') ? 'red' : 'orange'};">Impacto: ${impacto}</p>`;
        html += `<p>Previsão de Fim: ${data.DATA_FIM}</p>`;
    } else if (tipo === 'via_dupla') {
        html += `<p>Rodovia: ${data.RODOVIA}</p>`;
        html += `<p>Status: Duplicada</p>`;
        html += `<p>Descrição: ${data.DESCRICAO}</p>`;
    }

    return html;
}

function plotarPOI(data) {
    
    const tipo = (data.TIPO || 'DESCONHECIDO').toLowerCase();
    
    const startLat = parseFloat(data.START_LAT);
    const startLon = parseFloat(data.START_LON);
    const endLat = parseFloat(data.END_LAT);
    const endLon = parseFloat(data.END_LON);
    const lat = parseFloat(data.LAT);
    const lon = parseFloat(data.LON);
    
    let icon;
    let estilo;

    if (tipo === 'pedagio') {
        icon = IconePedagio;
    } else if (tipo === 'obra') {
        icon = IconeObra;
        estilo = { color: '#FF0000', weight: 5, opacity: 0.8, dashArray: '10, 5' };
    } else if (tipo === 'via_dupla') {
        icon = IconeViaDupla;
        estilo = { color: '#00AA00', weight: 4, opacity: 0.9 };
    }
    
    // --- LÓGICA PARA TRAÇAR UM TRECHO DE LINHA (OBRA/VIA_DUPLA) ---
    if (!isNaN(startLat) && !isNaN(endLat) && estilo) {
        
        const pontosTrecho = [
            [startLat, startLon],
            [endLat, endLon]
        ];
        
        L.polyline(pontosTrecho, estilo)
            .addTo(map)
            .bindPopup(construirPopup(data));

        L.marker([startLat, startLon], { icon: icon })
             .addTo(map)
             .bindPopup(`${data.TIPO}: ${data.NOME}`);
    } 
    // --- LÓGICA PARA PLOTAR UM PONTO (PEDAGIO) ---
    else if (!isNaN(lat) && !isNaN(lon) && tipo === 'pedagio') {
        L.marker([lat, lon], { icon: icon })
            .addTo(map)
            .bindPopup(construirPopup(data));
    }
}

function csvToJson(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 1) return [];

    const headers = lines[0].split(',').map(header => header.trim().toUpperCase());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const currentline = lines[i].split(',');

        for (let j = 0; j < headers.length; j++) {
            const value = currentline[j] ? currentline[j].trim() : '';
            if (value === '') continue; 

            obj[headers[j]] = value.replace(',', '.'); 
        }
        if (Object.keys(obj).length > 0) {
             result.push(obj);
        }
    }
    return result;
}

async function carregarDadosMestres() {
    
    try {
        // Adiciona um timestamp para evitar cache do Google Sheets
        const fetchUrl = `${URL_DADOS_MESTRA}&_t=${new Date().getTime()}`;
        const resposta = await fetch(fetchUrl);
        
        if (!resposta.ok) throw new Error(`Status HTTP ${resposta.status}`);
        
        const csvText = await resposta.text();
        const listaPOIs = csvToJson(csvText);

        dadosPedagios = [];
        dadosObras = [];
        dadosViasDuplas = [];

        listaPOIs.forEach(poi => {
            const tipo = (poi.TIPO || '').toUpperCase();
            if (tipo === 'PEDAGIO') {
                dadosPedagios.push(poi);
                plotarPOI(poi);
            } else if (tipo === 'OBRA') {
                dadosObras.push(poi);
                plotarPOI(poi);
            } else if (tipo === 'VIA_DUPLA') {
                dadosViasDuplas.push(poi);
                plotarPOI(poi);
            }
        });
        
        console.log(`Dados carregados: ${dadosPedagios.length} pedágios, ${dadosObras.length} obras, ${dadosViasDuplas.length} vias duplas.`);
        
    } catch (error) {
        console.error(`Erro ao carregar dados da planilha mestra:`, error);
        console.warn(`Verifique se o link da planilha está correto e publicado como CSV. URL utilizada: ${URL_DADOS_MESTRA}`);
    }
}

// Execução inicial
carregarDadosMestres();


// =================================================================
// 5. FUNÇÕES DE ROTEAMENTO E GEOCÓDIGO
// =================================================================

async function geocoding(endereco) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`;
    try {
        const resposta = await fetch(url, { headers: { 'User-Agent': 'CalculadoraRotasCustomizada/1.0' } });
        const dados = await resposta.json();
        if (dados && dados.length > 0) {
            return { lat: parseFloat(dados[0].lat), lon: parseFloat(dados[0].lon) };
        }
        return null;
    } catch (error) {
        console.error("Erro no Geocoding:", error);
        return null;
    }
}

async function calcularERenderizarRota(coordsOrigem, coordsDestino, eixos) {
    const coordString = `${coordsOrigem.lon},${coordsOrigem.lat};${coordsDestino.lon},${coordsDestino.lat}`;
    const url = `${URL_OSRM}${coordString}?steps=true&geometries=geojson&overview=full`;
    
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`OSRM Status: ${resposta.status}`);
        
        const dados = await resposta.json();
        
        if (dados.code !== 'Ok' || !dados.routes || dados.routes.length === 0) {
            alert("Não foi possível encontrar uma rota válida entre os pontos.");
            return;
        }

        const rota = dados.routes[0];
        const distanciaKM = (rota.distance / 1000).toFixed(2);
        const duracaoMin = (rota.duration / 60).toFixed(0);
        
        if (rotaAtualLayer) {
            map.removeLayer(rotaAtualLayer);
        }

        const geojson = rota.geometry;
        rotaAtualLayer = L.geoJSON(geojson, {
            style: { color: '#007bff', weight: 6, opacity: 0.7 }
        }).addTo(map);

        map.fitBounds(rotaAtualLayer.getBounds());
        
        calcularCustoCustomizado(geojson.coordinates, distanciaKM, duracaoMin, eixos);
        
    } catch (error) {
        console.error("Erro no Roteamento OSRM:", error);
        alert("Ocorreu um erro ao calcular a rota. Tente novamente.");
    }
}


// =================================================================
// 6. LÓGICA DE CÁLCULO DE CUSTOS CUSTOMIZADOS
// =================================================================

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function calcularPedagios(geometriaRota, eixos) {
    if (document.getElementById('evitar-pedagios').checked) {
        return { total: 0, porEixo: 0 }; 
    }

    const RAIO_DETECCAO_KM = 0.5; 
    let pedagioTotal = 0;
    const pedagiosEncontrados = new Set(); 

    for (const pedagio of dadosPedagios) {
        
        const pedagioLat = parseFloat(pedagio.LAT);
        const pedagioLon = parseFloat(pedagio.LON);
        const eixo12 = parseFloat(pedagio.EIXO_1_2);
        const eixoAdicional = parseFloat(pedagio.EIXO_ADICIONAL);

        if (isNaN(pedagioLat) || isNaN(pedagioLon)) continue;

        for (const [lonRota, latRota] of geometriaRota) {
            
            const distancia = calcularDistanciaHaversine(
                latRota, lonRota, 
                pedagioLat, pedagioLon
            );
            
            if (distancia <= RAIO_DETECCAO_KM) {
                if (!pedagiosEncontrados.has(pedagio.ID)) {
                    
                    let custo = eixo12;
                    if (eixos > 2) {
                        custo += eixoAdicional * (eixos - 2);
                    }
                    
                    pedagioTotal += custo;
                    pedagiosEncontrados.add(pedagio.ID);
                    break; 
                }
            }
        }
    }
    
    return {
        total: pedagioTotal,
        porEixo: pedagioTotal / (eixos > 0 ? eixos : 1)
    };
}

function calcularCustoCustomizado(geometriaRota, distanciaKM, duracaoMin, eixos) {
    
    const resultadosPedagio = calcularPedagios(geometriaRota, eixos);
    
    const precoCombustivel = parseFloat(document.getElementById('preco-combustivel').value);
    const consumo = parseFloat(document.getElementById('consumo').value);
    
    const combustivelTotal = consumo > 0 && precoCombustivel > 0
        ? (distanciaKM / consumo) * precoCombustivel
        : 0;
    
    atualizarResultados(distanciaKM, duracaoMin, resultadosPedagio.total, resultadosPedagio.porEixo, combustivelTotal);
}


// =================================================================
// 7. FUNÇÃO DE ATUALIZAÇÃO DA UI
// =================================================================

function atualizarResultados(distanciaKM, duracaoMin, pedagioTotal, pedagioPorEixo, combustivelTotal) {
    const custoTotal = pedagioTotal + combustivelTotal;

    document.getElementById('res-distancia').textContent = `${distanciaKM} KM`;
    document.getElementById('res-pedagio').textContent = `R$ ${pedagioTotal.toFixed(2)}`;
    document.getElementById('res-pedagio-eixo').textContent = `R$ ${pedagioPorEixo.toFixed(2)}`; 
    document.getElementById('res-combustivel').textContent = `R$ ${combustivelTotal.toFixed(2)}`;
    document.getElementById('res-total').textContent = `R$ ${custoTotal.toFixed(2)}`;
    
    document.getElementById('resultados-rota').style.display = 'block'; 
}


// =================================================================
// 8. LISTENER PRINCIPAL DO FORMULÁRIO
// =================================================================

const formRota = document.getElementById('form-rota');
formRota.addEventListener('submit', async function(event) {
    event.preventDefault(); 
    
    const origemTexto = document.getElementById('origem').value;
    const destinoTexto = document.getElementById('destino').value;
    const eixos = parseInt(document.getElementById('eixos').value);

    const btnCalcular = document.getElementById('btn-calcular');
    btnCalcular.disabled = true;
    btnCalcular.textContent = 'BUSCANDO E CALCULANDO...';

    const coordsOrigem = await geocoding(origemTexto);
    const coordsDestino = await geocoding(destinoTexto);

    if (!coordsOrigem || !coordsDestino) {
        alert("Erro: Não foi possível localizar a Origem ou o Destino. Tente um endereço mais específico.");
        btnCalcular.disabled = false;
        btnCalcular.textContent = 'CALCULAR ROTA';
        return;
    }

    await calcularERenderizarRota(coordsOrigem, coordsDestino, eixos);
    
    btnCalcular.disabled = false;
    btnCalcular.textContent = 'CALCULAR ROTA';
});
