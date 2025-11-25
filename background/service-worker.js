// ES6 Imports for V2.0 services
import { MonitoringService } from './monitoring-service.js';

async function initializeStorage() {
    await chrome.storage.local.set({
        products: [],
        settings: {
            autoCollect: false,
            rateLimitDelay: 2000,
            maxConcurrent: 1,
            notifications: true
        },
        stats: {
            total: 0,
            today: 0,
            lastCollectedDate: new Date().toDateString()
        }
    });
    console.log('Storage 초기화 완료');
}

/**
 * 서비스 변수 선언
 */
let monitoringService;
let geminiService;
let marginAnalysisService;

/**
 * 모니터링 서비스 초기화
 */
async function initializeMonitoring() {
    try {
        monitoringService = new MonitoringService();
        await monitoringService.initialize();
        console.log('Monitoring Service 초기화 완료');
    } catch (error) {
        console.error('Monitoring Service 초기화 실패:', error);
    }
}

/**
 * AI 및 마진 분석 서비스 초기화
 */
async function initializeServices() {
    try {
        // AI/Margin 서비스는 web_accessible_resources로 로드
        // 필요할 때 동적으로 로드하도록 보류
        console.log('AI & Margin Services will be loaded on demand');
    } catch (error) {
        console.error('Service 초기화 실패:', error);
    }
}

// 초기화 실행
initializeStorage().then(() => {
    initializeMonitoring();
    initializeServices();
});

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Service Worker 메시지 수신:', message.action);

    switch (message.action) {
        case 'saveProduct':
            handleSaveProduct(message.data, sendResponse);
            return true;  // 비동기 응답

        case 'startStoreScraping':
            handleStoreScraping(message.links, sender.tab.id);
            sendResponse({ success: true });
            break;

        case 'stopStoreScraping':
            stopStoreScraping();
            sendResponse({ success: true });
            break;

        case 'getStats':
            handleGetStats(sendResponse);
            return true;  // 비동기 응답

        case 'openDashboard':
            openDashboard();
            sendResponse({ success: true });
            break;

        // 모니터링 관련 액션
        case 'startMonitoring':
            handleStartMonitoring(message.product, message.options, sendResponse);
            return true;

        case 'stopMonitoring':
            handleStopMonitoring(message.productId, sendResponse);
            return true;

        case 'getMonitoringProducts':
            handleGetMonitoringProducts(sendResponse);
            return true;

        // AI 관련 액션
        case 'generateDescription':
            handleGenerateDescription(message.product, sendResponse);
            return true;

        case 'optimizeTitle':
            handleOptimizeTitle(message.productName, sendResponse);
            return true;

        // 마진 분석 관련 액션
        case 'analyzeMargin':
            handleAnalyzeMargin(message.product, sendResponse);
            return true;
    }
});

/**
 * AI 상세페이지 생성 처리
 */
async function handleGenerateDescription(product, sendResponse) {
    try {
        // 동적 로드
        if (!geminiService && typeof GeminiService !== 'undefined') {
            geminiService = new GeminiService();
        }

        if (!geminiService) {
            throw new Error('GeminiService not available');
        }

        const result = await geminiService.generateDescription(product);
        sendResponse({ success: true, data: result });
    } catch (error) {
        console.error('AI 생성 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * AI 상품명 최적화 처리
 */
async function handleOptimizeTitle(productName, sendResponse) {
    try {
        // 동적 로드
        if (!geminiService && typeof GeminiService !== 'undefined') {
            geminiService = new GeminiService();
        }

        if (!geminiService) {
            throw new Error('GeminiService not available');
        }

        const result = await geminiService.optimizeProductName(productName);
        sendResponse({ success: true, data: result });
    } catch (error) {
        console.error('AI 최적화 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 마진 분석 처리
 */
async function handleAnalyzeMargin(product, sendResponse) {
    try {
        // 동적 로드
        if (!marginAnalysisService && typeof MarginAnalysisService !== 'undefined') {
            marginAnalysisService = new MarginAnalysisService();
        }

        if (!marginAnalysisService) {
            throw new Error('MarginAnalysisService not available');
        }

        const analysis = await marginAnalysisService.analyzeMargin(product);
        sendResponse({ success: true, data: analysis });
    } catch (error) {
        console.error('마진 분석 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 상품 저장 처리
 */
async function handleSaveProduct(productData, sendResponse) {
    try {
        console.log('상품 저장 시작:', productData);

        // 마진 분석 자동 실행 (옵션)
        if (typeof MarginAnalysisService !== 'undefined') {
            try {
                if (!marginAnalysisService) {
                    marginAnalysisService = new MarginAnalysisService();
                }
                const marginData = await marginAnalysisService.analyzeMargin(productData);
                productData.marginAnalysis = marginData;
            } catch (e) {
                console.warn('자동 마진 분석 실패:', e);
            }
        }

        // 현재 상품 목록 가져오기
        const result = await chrome.storage.local.get(['products']);
        let products = result.products || [];

        // URL 중복 체크
        const existingIndex = products.findIndex(p => p.url === productData.url);

        if (existingIndex >= 0) {
            // 기존 상품 업데이트
            console.log('기존 상품 업데이트');
            products[existingIndex] = {
                ...products[existingIndex],
                ...productData,
                updatedAt: new Date().toISOString()
            };
        } else {
            // 새 상품 추가
            console.log('새 상품 추가');
            const newProduct = {
                ...productData,
                id: Date.now(),
                collectedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            products.push(newProduct);
        }

        // 저장
        await chrome.storage.local.set({ products });
        console.log('상품 저장 완료. 총', products.length, '개');

        // 통계 업데이트
        await updateStats();

        // 알림
        const settings = await getSetting('settings');
        if (settings?.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
                title: '상품 수집 완료',
                message: `${productData.name || '상품'}이(가) 수집되었습니다.`,
                silent: true
            });
        }

        sendResponse({ success: true, count: products.length });
    } catch (error) {
        console.error('상품 저장 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 상점 몰털이 처리
 */
let scrapingQueue = [];
let isScrapingActive = false;
let currentTabId = null;
let completedCount = 0;

async function handleStoreScraping(links, tabId) {
    scrapingQueue = [...links];
    isScrapingActive = true;
    currentTabId = tabId;
    completedCount = 0;

    console.log(`상점 몰털이 시작: ${links.length}개 상품`);

    // 진행 상황 초기 전송
    sendProgress(0, links.length);

    processScrapingQueue();
}

/**
 * 스크래핑 큐 처리
 */
async function processScrapingQueue() {
    if (!isScrapingActive || scrapingQueue.length === 0) {
        // 완료
        console.log('상점 몰털이 완료');
        if (currentTabId) {
            try {
                await chrome.tabs.sendMessage(currentTabId, {
                    action: 'scrapingComplete'
                });
            } catch (e) {
                console.log('완료 메시지 전송 실패 (탭이 닫혔을 수 있음)');
            }
        }
        isScrapingActive = false;
        completedCount = 0;
        return;
    }

    const totalLinks = scrapingQueue.length + completedCount;
    const url = scrapingQueue.shift();

    console.log(`처리 중: ${completedCount + 1}/${totalLinks} - ${url}`);

    try {
        // 새 탭에서 상품 페이지 열기 (백그라운드)
        const tab = await chrome.tabs.create({ url, active: false });

        // 페이지 로드 대기
        await waitForTabLoad(tab.id);

        // 짧은 대기 (동적 콘텐츠 로딩)
        await sleep(1000);

        // 상품 데이터 수집
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'collectProduct' });

        if (response?.success && response.data) {
            console.log('상품 데이터 수집 성공:', response.data.name);
            await handleSaveProduct(response.data, () => { });
        } else {
            console.log('상품 데이터 수집 실패');
        }

        // 탭 닫기
        await chrome.tabs.remove(tab.id);

    } catch (error) {
        console.error('상품 수집 오류:', error);
    }

    // 진행상황 업데이트
    completedCount++;
    sendProgress(completedCount, totalLinks);

    // Rate Limiting
    const settings = await getSetting('settings');
    const delay = settings?.rateLimitDelay || 2000;
    await sleep(delay);

    // 다음 상품 처리
    processScrapingQueue();
}

/**
 * 진행 상황 전송
 */
function sendProgress(current, total) {
    if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, {
            action: 'updateProgress',
            current,
            total
        }).catch(() => {
            console.log('진행 상황 전송 실패');
        });
    }
}

/**
 * 탭 로드 대기
 */
function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // 타임아웃 (15초)
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 15000);
    });
}

/**
 * 대기 함수
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 스크래핑 중지
 */
function stopStoreScraping() {
    isScrapingActive = false;
    scrapingQueue = [];
    completedCount = 0;
    console.log('상점 몰털이 중지됨');
}

/**
 * 통계 조회
 */
async function handleGetStats(sendResponse) {
    try {
        const result = await chrome.storage.local.get(['products']);
        const products = result.products || [];

        // 오늘 수집한 상품 수 계산
        const today = new Date().toDateString();
        const todayProducts = products.filter(p => {
            if (!p.collectedAt) return false;
            const collectedDate = new Date(p.collectedAt).toDateString();
            return collectedDate === today;
        });

        const stats = {
            total: products.length,
            today: todayProducts.length
        };

        console.log('통계:', stats);
        sendResponse(stats);
    } catch (error) {
        console.error('통계 조회 오류:', error);
        sendResponse({ total: 0, today: 0 });
    }
}

/**
 * 통계 업데이트
 */
async function updateStats() {
    const result = await chrome.storage.local.get(['products']);
    const products = result.products || [];

    const today = new Date().toDateString();
    const todayProducts = products.filter(p => {
        if (!p.collectedAt) return false;
        const collectedDate = new Date(p.collectedAt).toDateString();
        return collectedDate === today;
    });

    await chrome.storage.local.set({
        stats: {
            total: products.length,
            today: todayProducts.length,
            lastCollectedDate: today
        }
    });
}

/**
 * 대시보드 열기
 */
function openDashboard() {
    chrome.tabs.create({
        url: chrome.runtime.getURL('dashboard/dashboard.html')
    });
}

/**
 * 설정 가져오기
 */
async function getSetting(key) {
    const result = await chrome.storage.local.get([key]);
    return result[key];
}

/**
 * 알람 리스너 (스케줄링 기능용 - 추후 구현)
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('알람 실행:', alarm.name);
});

console.log('Service Worker 로드 완료');
