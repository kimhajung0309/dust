// Vercel 서버리스 함수 엔드포인트 주소입니다.
const API_URL = '/api/dust';

// 전역 Chart.js 인스턴스 보관 변수입니다. (새로운 데이터 로드 시 기존 차트를 파괴하고 재생성)
let dustChartInstance = null;

// DOM 요소 참조 모음입니다.
const sidoSelect = document.getElementById('sido-select');
const trafficLightCard = document.getElementById('traffic-light-card');
const regionNameDisplay = document.getElementById('region-name-display');
const baseTimeDisplay = document.getElementById('base-time-display');
const statusEmoji = document.getElementById('status-emoji');
const statusText = document.getElementById('status-text');
const averageValue = document.getElementById('average-value');
const actionGuide = document.getElementById('action-guide');
const statusMessage = document.getElementById('status-message');
const statusMessageText = document.getElementById('status-message-text');
const stationList = document.getElementById('station-list');

// 웹 페이지가 처음 로드되면 기본 선택값인 '서울' 데이터를 불러옵니다.
document.addEventListener('DOMContentLoaded', () => {
    fetchAirQualityData(sidoSelect.value);
});

// 사용자가 시도 드롭다운을 변경하면 새로운 지역의 데이터를 요청합니다.
sidoSelect.addEventListener('change', (event) => {
    fetchAirQualityData(event.target.value);
});

// API를 통해 선택된 시도의 실시간 대기 정보를 가져오는 비동기 함수입니다.
async function fetchAirQualityData(sidoName) {
    // 1. 데이터를 불러오는 동안 로딩 상태 UI로 전환합니다.
    setLoadingState(sidoName);

    try {
        // 자체 Vercel 서버리스 API 호출을 수행합니다.
        const response = await fetch(`${API_URL}?sido=${encodeURIComponent(sidoName)}`);
        const data = await response.json();

        // 응답 상태가 실패이거나 백엔드에서 success: false를 보낸 경우 처리합니다.
        if (!response.ok || data.success === false) {
            throw new Error(data.message || `요청 실패 (코드: ${response.status})`);
        }

        // 실제 측정소 데이터 배열 목록입니다.
        const items = data?.response?.body?.items;

        // 측정 데이터가 존재하지 않는 경우 처리합니다.
        if (!items || items.length === 0) {
            showErrorState('해당 지역의 실시간 측정소 데이터를 찾을 수 없습니다.');
            return;
        }

        // 로딩 안내 메시지를 숨깁니다.
        statusMessage.style.display = 'none';

        // 가장 최신의 측정 시각을 파악하여 상단에 한국어 형식으로 표시합니다.
        const latestTime = findLatestDataTime(items);
        baseTimeDisplay.textContent = formatKoreanDate(latestTime);

        // 지역 평균 수치 계산 및 '공기 신호등' 메인 카드를 갱신합니다.
        updateTrafficLight(items, sidoName);

        // 측정소별 미세먼지 수치 상위 10개 가로 막대그래프를 렌더링합니다.
        renderDustTopChart(items);

        // 각 측정소별 은은한 카드 목록을 화면에 렌더링합니다.
        renderStationCards(items);

    } catch (error) {
        // 통신 오류 또는 인증키 문제 발생 시 한국어 에러 메시지를 표시합니다.
        console.error('데이터 조회 오류:', error);
        showErrorState(error.message);
    }
}

// 로딩 중 UI를 세팅하는 함수입니다.
function setLoadingState(sidoName) {
    statusMessage.style.display = 'flex';
    statusMessageText.textContent = `${sidoName} 지역 대기질 데이터를 불러오는 중...`;
    
    stationList.innerHTML = '';
    regionNameDisplay.textContent = sidoName;
    baseTimeDisplay.textContent = '불러오는 중...';
    
    // 신호등 카드를 로딩 테마로 변경합니다.
    trafficLightCard.className = 'traffic-light-card theme-loading';
    statusEmoji.textContent = '⏳';
    statusText.textContent = '불러오는 중...';
    averageValue.textContent = '-';
    actionGuide.textContent = '최신 미세먼지 정보를 받아오고 있습니다.';
}

// 에러 발생 시 UI를 세팅하는 함수입니다.
function showErrorState(msg) {
    statusMessage.style.display = 'flex';
    statusMessageText.innerHTML = `<span style="color:#ef4444;">${msg}</span>`;
    
    trafficLightCard.className = 'traffic-light-card theme-unknown';
    statusEmoji.textContent = '⚠️';
    statusText.textContent = '확인 필요';
    averageValue.textContent = '-';
    actionGuide.textContent = '대기질 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    baseTimeDisplay.textContent = '측정 불가';

    // 차트가 이미 있다면 비워줍니다.
    if (dustChartInstance) {
        dustChartInstance.destroy();
        dustChartInstance = null;
    }
}

// "2026-10-28 16:00" 같은 API 원본 문자열을 "2026년 10월 28일 16시 기준" 형태로 변환하는 함수입니다.
function formatKoreanDate(dataTimeString) {
    if (!dataTimeString || typeof dataTimeString !== 'string') {
        return '측정 시각 미상';
    }
    const parts = dataTimeString.trim().split(/[\s-:]+/);
    if (parts.length >= 4) {
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const hour = parseInt(parts[3], 10);
        return `${year}년 ${month}월 ${day}일 ${hour}시 기준`;
    }
    return `${dataTimeString} 기준`;
}

// 측정소 목록 중 유효한 최근 측정 시각을 하나 찾는 함수입니다.
function findLatestDataTime(items) {
    for (const item of items) {
        if (item.dataTime && item.dataTime.trim() !== '') {
            return item.dataTime;
        }
    }
    return '';
}

// 미세먼지 수치 포맷팅 ('-'이거나 누락 시 '측정 안 됨' 반환)
function formatValue(value) {
    if (!value || value.trim() === '-' || isNaN(value)) {
        return '측정 안 됨';
    }
    return `${value} ㎍/㎥`;
}

// 메인 '공기 신호등' 상태 갱신 함수 (이모지 + 텍스트 + 평균 + 마스크 권고 문구)
function updateTrafficLight(items, sidoName) {
    let validCount = 0;
    let totalPm10 = 0;

    items.forEach((item) => {
        const val = item.pm10Value;
        if (val && val.trim() !== '-' && !isNaN(val)) {
            totalPm10 += parseFloat(val);
            validCount += 1;
        }
    });

    if (validCount > 0) {
        const avg = Math.round(totalPm10 / validCount);
        averageValue.textContent = avg;

        if (avg <= 30) {
            trafficLightCard.className = 'traffic-light-card theme-good';
            statusEmoji.textContent = '🔵';
            statusText.textContent = '좋음';
            actionGuide.textContent = '공기가 깨끗해요! 쾌적하게 야외활동을 즐기세요 🌿';
        } else if (avg <= 80) {
            trafficLightCard.className = 'traffic-light-card theme-normal';
            statusEmoji.textContent = '🟢';
            statusText.textContent = '보통';
            actionGuide.textContent = '무난한 공기질이에요. 일상적인 야외활동이 가능해요 ✨';
        } else if (avg <= 150) {
            trafficLightCard.className = 'traffic-light-card theme-bad';
            statusEmoji.textContent = '🟠';
            statusText.textContent = '나쁨';
            actionGuide.textContent = '공기가 탁해요! 외출 시 마스크를 챙기세요 😷';
        } else {
            trafficLightCard.className = 'traffic-light-card theme-very-bad';
            statusEmoji.textContent = '🔴';
            statusText.textContent = '매우나쁨';
            actionGuide.textContent = '경고! 외출 시 마스크를 꼭 챙기시고 무리한 실외활동을 자제하세요 🚨';
        }
    } else {
        trafficLightCard.className = 'traffic-light-card theme-unknown';
        statusEmoji.textContent = '⚪';
        statusText.textContent = '측정불가';
        averageValue.textContent = '-';
        actionGuide.textContent = '현재 해당 지역에 집계 가능한 정상 측정값이 없습니다.';
    }
}

// 등급에 따른 그래프 막대 색상 및 테두리 색상 코드 반환 헬퍼입니다.
function getGradeColor(pm10Grade) {
    switch (pm10Grade) {
        case '1':
            return { fill: '#3b82f6', border: '#1d4ed8' }; // 🔵 좋음 (파랑)
        case '2':
            return { fill: '#22c55e', border: '#15803d' }; // 🟢 보통 (초록)
        case '3':
            return { fill: '#f97316', border: '#c2410c' }; // 🟠 나쁨 (주황)
        case '4':
            return { fill: '#ef4444', border: '#b91c1c' }; // 🔴 매우나쁨 (빨강)
        default:
            return { fill: '#94a3b8', border: '#64748b' }; // ⚪ 알 수 없음 (회색)
    }
}

// Chart.js를 사용해 미세먼지 수치 상위 10개 측정소를 가로 막대그래프로 그리는 함수입니다.
function renderDustTopChart(items) {
    // 1. '측정 안 됨'(-) 데이터는 제외하고 유효한 숫자만 필터링합니다.
    const validStations = items
        .filter(item => item.pm10Value && item.pm10Value.trim() !== '-' && !isNaN(item.pm10Value))
        .map(item => ({
            stationName: item.stationName || '미상',
            pm10Value: parseFloat(item.pm10Value),
            pm10Grade: item.pm10Grade
        }));

    // 2. 미세먼지 수치(pm10Value)가 높은 순서대로 내림차순 정렬합니다.
    validStations.sort((a, b) => b.pm10Value - a.pm10Value);

    // 3. 상위 10개 측정소만 슬라이스합니다.
    const top10 = validStations.slice(0, 10);

    // 차트 레이블, 데이터셋 수치, 등급별 색상 배열을 생성합니다.
    const labels = top10.map(item => item.stationName);
    const dataValues = top10.map(item => item.pm10Value);
    const backgroundColors = top10.map(item => getGradeColor(item.pm10Grade).fill);
    const borderColors = top10.map(item => getGradeColor(item.pm10Grade).border);

    // 캔버스 엘리먼트를 가져옵니다.
    const ctx = document.getElementById('dust-top-chart').getContext('2d');

    // 이미 존재하는 차트 인스턴스가 있다면 먼저 소멸(destroy)시켜 메모리 누수 및 중복 렌더링을 방지합니다.
    if (dustChartInstance) {
        dustChartInstance.destroy();
    }

    // Chart.js 가로 막대그래프(indexAxis: 'y')를 생성합니다.
    dustChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '미세먼지 (㎍/㎥)',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 6,
                barPercentage: 0.7
            }]
        },
        options: {
            indexAxis: 'y', // 가로 막대그래프 설정
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // 단일 데이터셋이므로 범례 숨김
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Pretendard', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Pretendard', size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return ` 미세먼지 수치: ${context.parsed.x} ㎍/㎥`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: '#f1f5f9'
                    },
                    ticks: {
                        font: { family: 'Pretendard', size: 11, weight: '600' },
                        color: '#64748b'
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { family: 'Pretendard', size: 12, weight: '700' },
                        color: '#1e293b'
                    }
                }
            }
        }
    });
}

// 등급(1, 2, 3, 4)에 따라 은은한 카드 스타일 클래스와 한글 명칭을 반환합니다.
function getSoftGradeInfo(pm10Grade) {
    switch (pm10Grade) {
        case '1':
            return { classModifier: 'card-soft-1', text: '🔵 좋음' };
        case '2':
            return { classModifier: 'card-soft-2', text: '🟢 보통' };
        case '3':
            return { classModifier: 'card-soft-3', text: '🟠 나쁨' };
        case '4':
            return { classModifier: 'card-soft-4', text: '🔴 매우나쁨' };
        default:
            return { classModifier: 'card-soft-unknown', text: '⚪ 측정불가' };
    }
}

// 개별 측정소 카드를 은은한 색상 스타일로 렌더링하는 함수입니다.
function renderStationCards(items) {
    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
        const card = document.createElement('article');
        const gradeInfo = getSoftGradeInfo(item.pm10Grade);

        card.className = `station-sub-card ${gradeInfo.classModifier}`;

        const pm10Display = formatValue(item.pm10Value);
        const pm25Display = formatValue(item.pm25Value);
        const timeKorean = formatKoreanDate(item.dataTime);

        card.innerHTML = `
            <div class="sub-card-header">
                <span class="sub-station-name">${item.stationName || '측정소'}</span>
                <span class="badge-status">${gradeInfo.text}</span>
            </div>
            <div class="sub-card-body">
                <div class="info-row">
                    <span class="info-label">미세먼지 (PM10)</span>
                    <span class="info-val">${pm10Display}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">초미세먼지 (PM2.5)</span>
                    <span class="info-val">${pm25Display}</span>
                </div>
            </div>
            <div class="sub-card-footer">
                <span>${timeKorean}</span>
            </div>
        `;

        fragment.appendChild(card);
    });

    stationList.appendChild(fragment);
}
