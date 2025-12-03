// =================================================================
// 1. VARIÁVEIS DE CONFIGURAÇÃO E DADOS
// =================================================================

const CENTRO_MAPA = [-14.235, -51.925]; 
const ZOOM_INICIAL = 4; 

// URLs RAW dos seus arquivos JSON (Ajuste para seus caminhos finais no GitHub)
const URL_DADOS_PEDAGIOS = './data/pedagios.json'; 
const URL_DADOS_OBRAS = './data/obras.json';       
const URL_OSRM = 'https://router.project-osrm.org/route/v1/driving/'; // API de Roteamento OSRM

let dadosPedagios = [];
let dadosObras = [];
let rotaAtualLayer; // Variável para a linha da rota no mapa


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


// =================================================================
// 4. FUNÇÕES DE VISUALIZAÇÃO E DADOS
// =================================================================

function construirPopup(data, tipo) {
    let html = `<h4>${data.nome}</h4>`;
    
    if (tipo === 'pedagio') {
        html += `<p>Rodovia: ${data.rodovia}</p>`;
        html += `<p>Tarifa Base (2 Eixos): R$ ${data.eixo_1_2.toFixed(2)}</p>`;
        html += `<p>Eixo Adicional: R$ ${data.eixo_adicional.toFixed(2)}</p>`;
    } else if (tipo === 'obra') {
        html += `<p>Rodovia: ${data.rodovia}</p>`;
        html += `<p>Descrição: ${data.descricao}</p>`;
        html += `<p style="color: ${data.impacto.includes('Total') ? 'red' : 'orange'};">Impacto: ${data.impacto}</p>`;
        html += `<p>Previsão de Fim: ${data.data_fim}</p>`;
    }

    return html;
}

function plotarPOI(data, icon, tipo) {
    
    // Lógica para TRAÇAR UM TRECHO DE OBRA (POLYLINE)
    if (tipo === 'obra' && data.start_lat && data.end_lat) {
        
        const pontosTrecho = [
            [data.start_lat, data.start_lon],
            [data.end_lat, data.end_lon]
        ];
        
        const estiloObra = {
            color: '#FF0000', 
            weight: 5,
            opacity: 0.8,
            dashArray: '10, 5' 
        };

        L.polyline(pontosTrecho, estiloObra)
            .addTo(map)
            .bindPopup(construirPopup(data, tipo));

        // Plota um marcador no início da obra
        L.marker([data.start_lat, data.start_lon], { icon: icon })
             .addTo(map)
             .bindPopup(`INÍCIO da Obra: ${data.nome}`);
        
    } 
    // Lógica para PLOTAR UM PONTO (MARKER)
    else if (data.lat && data.lon) {
        L.marker([data.lat, data.lon], { icon: icon })
            .addTo(map)
            .bindPopup(construirPopup(data, tipo));
    }
}

async function carregarMarcadores(url, icon, tipo) {
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Status HTTP ${resposta.status}`);
        
        const listaPOIs = await resposta.json();
        
        if (tipo === 'pedagio') dadosPedagios = listaPOIs;
        if (tipo === 'obra') dadosObras = listaPOIs;

        listaPOIs.forEach(poi => {
            // Garante que as coordenadas sejam números
            if (poi.lat) poi.lat = parseFloat(poi.lat);
            if (poi.lon) poi.lon = parseFloat(poi.lon);
            if (poi.start_lat) poi.start_lat = parseFloat(poi.start_lat);
            if (poi.start_lon) poi.start_lon = parseFloat(poi.start_lon);
            if (poi.end_lat) poi.end_lat = parseFloat(poi.end_lat);
            if (poi.end_lon) poi.end_lon = parseFloat(poi.end_lon);
            
            plotarPOI(poi, icon, tipo);
        });
        
    } catch (error) {
        console.error(`Erro ao carregar dados de ${tipo}:`, error);
        console.warn(`Verifique o arquivo '${tipo}.json'.`);
    }
}

// Execução inicial
carregarMarcadores(URL_DADOS_PEDAGIOS, IconePedagio, 'pedagio');
carregarMarcadores(URL_DADOS_OBRAS, IconeObra, 'obra');


// =================================================================
// 5. FUNÇÕES DE ROTEAMENTO E GEOCÓDIGO
// =================================================================

/**
 * Converte um endereço de texto em coordenadas (Lat/Lon) usando Nominatim.
 */
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

/**
 * Calcula a rota usando OSRM e renderiza no mapa.
 */
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
        
        // --- Visualização da Rota ---
        if (rotaAtualLayer) {
            map.removeLayer(rotaAtualLayer);
        }

        const geojson = rota.geometry;
        rotaAtualLayer = L.geoJSON(geojson, {
            style: { color: '#007bff', weight: 6, opacity: 0.7 }
        }).addTo(map);

        map.fitBounds(rotaAtualLayer.getBounds());
        
        // --- Cálculo Customizado! ---
        calcularCustoCustomizado(geojson.coordinates, distanciaKM, duracaoMin, eixos);
        
    } catch (error) {
        console.error("Erro no Roteamento OSRM:", error);
        alert("Ocorreu um erro ao calcular a rota. Tente novamente.");
    }
}


// =================================================================
// 6. LÓGICA DE CÁLCULO DE CUSTOS CUSTOMIZADOS
// =================================================================

/**
 * Calcula a distância entre dois pontos Lat/Lon em quilômetros (Fórmula de Haversine).
 */
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio médio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}


/**
 * Executa a lógica customizada de detecção de pedágios e cálculo de custo.
 */
function calcularPedagios(geometriaRota, eixos) {
    if (document.getElementById('evitar-pedagios').checked) {
        return 0; 
    }

    const RAIO_DETECCAO_KM = 0.5; // 500 metros
    let pedagioTotal = 0;
    const pedagiosEncontrados = new Set(); 

    // 1. Percorre a lista de pedágios customizados
    for (const pedagio of dadosPedagios) {
        
        // 2. Percorre a geometria da rota (o OSRM retorna [lon, lat])
        for (const [lonRota, latRota] of geometriaRota) {
            
            // 3. Calcula a distância entre o ponto da rota e o pedágio
            const distancia = calcularDistanciaHaversine(
                latRota, lonRota, 
                pedagio.lat, pedagio.lon
            );
            
            // 4. Detecção e Cálculo
            if (distancia <= RAIO_DETECCAO_KM) {
                if (!pedagiosEncontrados.has(pedagio.id)) {
                    
                    let custo = pedagio.eixo_1_2;
                    // Aplica a lógica de eixos (carro = 2 eixos; caminhão > 2 eixos)
                    if (eixos > 2) {
                        custo += pedagio.eixo_adicional * (eixos - 2);
                    }
                    
                    pedagioTotal += custo;
                    pedagiosEncontrados.add(pedagio.id);
                    
                    console.log(`Pedágio detectado: ${pedagio.nome}. Custo calculado: R$ ${custo.toFixed(2)}`);
                    break; 
                }
            }
        }
    }
    
    // Retorna o valor total e, adicionalmente, o valor por eixo
    return {
        total: pedagioTotal,
        porEixo: pedagioTotal / (eixos > 0 ? eixos : 1)
    };
}


/**
 * Função principal que coordena o cálculo de custos e atualiza a UI.
 */
function calcularCustoCustomizado(geometriaRota, distanciaKM, duracaoMin, eixos) {
    console.log("Iniciando cálculo customizado de custos...");
    
    // CÁLCULO DE PEDÁGIOS
    const resultadosPedagio = calcularPedagios(geometriaRota, eixos);
    
    // CÁLCULO DE COMBUSTÍVEL
    const precoCombustivel = parseFloat(document.getElementById('preco-combustivel').value);
    const consumo = parseFloat(document.getElementById('consumo').value);
    
    // Custo de Combustível: (Distância / Consumo) * Preço
    const combustivelTotal = consumo > 0 && precoCombustivel > 0
        ? (distanciaKM / consumo) * precoCombustivel
        : 0;
    
    // ATUALIZAÇÃO DOS RESULTADOS
    atualizarResultados(distanciaKM, duracaoMin, resultadosPedagio.total, resultadosPedagio.porEixo, combustivelTotal);
}


// =================================================================
// 7. FUNÇÃO DE ATUALIZAÇÃO DA UI
// =================================================================

function atualizarResultados(distanciaKM, duracaoMin, pedagioTotal, pedagioPorEixo, combustivelTotal) {
    const custoTotal = pedagioTotal + combustivelTotal;

    document.getElementById('res-distancia').textContent = `${distanciaKM} KM`;
    document.getElementById('res-pedagio').textContent = `R$ ${pedagioTotal.toFixed(2)}`;
    // A span 'res-pedagio-eixo' deve estar no seu index.html!
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
    
    // 1. Captura de Dados
    const origemTexto = document.getElementById('origem').value;
    const destinoTexto = document.getElementById('destino').value;
    const eixos = parseInt(document.getElementById('eixos').value);

    const btnCalcular = document.getElementById('btn-calcular');
    btnCalcular.disabled = true;
    btnCalcular.textContent = 'BUSCANDO E CALCULANDO...';

    // 2. Geocoding
    const coordsOrigem = await geocoding(origemTexto);
    const coordsDestino = await geocoding(destinoTexto);

    if (!coordsOrigem || !coordsDestino) {
        alert("Erro: Não foi possível localizar a Origem ou o Destino. Tente um endereço mais específico.");
        btnCalcular.disabled = false;
        btnCalcular.textContent = 'CALCULAR ROTA';
        return;
    }

    // 3. Roteamento e Cálculo
    await calcularERenderizarRota(coordsOrigem, coordsDestino, eixos);
    
    btnCalcular.disabled = false;
    btnCalcular.textContent = 'CALCULAR ROTA';
});