/**
 * Service Worker (Simplified for Supabase)
 * 상품 데이터를 Supabase로 전송
 */

// Static import (Service Worker는 dynamic import를 지원하지 않음)
import { SupabaseClient } from '../lib/supabase-client.js';

// Supabase 클라이언트 인스턴스
let supabaseClient = null;

async function initializeSupabase() {
    if (supabaseClient) return supabaseClient;

    try {
        supabaseClient = new SupabaseClient();
        await supabaseClient.initialize();
        console.log('[ServiceWorker] Supabase 초기화 완료');
        return supabaseClient;
    } catch (error) {
        console.error('[ServiceWorker] Supabase 초기화 실패:', error);
        return null;
    }
}

// 초기화
chrome.runtime.onInstalled.addListener(() => {
    console.log('[ServiceWorker] 설치 완료');
    initializeSupabase();
});

// 시작 시에도 초기화
initializeSupabase();

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[ServiceWorker] 메시지 수신:', message.action);

    switch (message.action) {
        case 'saveProduct':
            handleSaveProduct(message.data, sendResponse);
            return true; // 비동기 응답

        case 'getStats':
            handleGetStats(sendResponse);
            return true;

        case 'signIn':
            handleSignIn(message.email, message.password, sendResponse);
            return true;

        case 'signOut':
            handleSignOut(sendResponse);
            return true;

        case 'getSession':
            handleGetSession(sendResponse);
            return true;

        case 'checkDuplicate':
            handleCheckDuplicate(message.url, sendResponse);
            return true;

        case 'batchCollect':
            handleBatchCollect(sendResponse);
            return true;
    }
});

/**
 * 상품 저장 처리 (Supabase)
 */
async function handleSaveProduct(productData, sendResponse) {
    try {
        console.log('[ServiceWorker] 상품 저장 시작:', productData.name);

        const client = await initializeSupabase();

        // Supabase에 저장
        await client.saveProduct(productData);

        // 알림
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
            title: '상품 수집 완료',
            message: `${productData.name}이(가) Supabase에 저장되었습니다.`,
            silent: true
        });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[ServiceWorker] 상품 저장 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 통계 조회
 */
async function handleGetStats(sendResponse) {
    try {
        const client = await initializeSupabase();
        const stats = await client.getStats();
        sendResponse(stats);
    } catch (error) {
        console.error('[ServiceWorker] 통계 조회 오류:', error);
        sendResponse({ total: 0, today: 0 });
    }
}

/**
 * 로그인 처리
 */
async function handleSignIn(email, password, sendResponse) {
    try {
        const client = await initializeSupabase();
        const result = await client.signIn(email, password);
        sendResponse(result);
    } catch (error) {
        console.error('[ServiceWorker] 로그인 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 로그아웃 처리
 */
async function handleSignOut(sendResponse) {
    try {
        const client = await initializeSupabase();
        const result = await client.signOut();
        sendResponse(result);
    } catch (error) {
        console.error('[ServiceWorker] 로그아웃 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 세션 조회
 */
async function handleGetSession(sendResponse) {
    try {
        const client = await initializeSupabase();
        const session = client.getSession();
        sendResponse({ session });
    } catch (error) {
        console.error('[ServiceWorker] 세션 조회 오류:', error);
        sendResponse({ session: null });
    }
}

/**
 * 중복 상품 체크
 */
async function handleCheckDuplicate(url, sendResponse) {
    try {
        const client = await initializeSupabase();
        const result = await client.checkDuplicateByUrl(url);
        sendResponse(result);
    } catch (error) {
        console.error('[ServiceWorker] 중복 체크 오류:', error);
        sendResponse({ isDuplicate: false, product: null });
    }
}

/**
 * 배치 수집 처리
 */
async function handleBatchCollect(sendResponse) {
    try {
        console.log('[ServiceWorker] 배치 수집 시작');

        // 1. 현재 창의 모든 탭 조회
        const tabs = await chrome.tabs.query({ currentWindow: true });

        // 2. 상품 페이지 탭만 필터링
        const productTabs = tabs.filter(tab => isProductPage(tab.url));

        console.log(`[ServiceWorker] 상품 페이지 탭 ${productTabs.length}개 발견`);

        if (productTabs.length === 0) {
            sendResponse({
                success: false,
                error: '수집 가능한 상품 페이지가 없습니다.'
            });
            return;
        }

        // 3. 결과 객체 초기화
        const results = {
            total: productTabs.length,
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        // 4. 순차 수집
        for (let i = 0; i < productTabs.length; i++) {
            const tab = productTabs[i];
            const current = i + 1;
            const percentage = Math.floor((current / productTabs.length) * 100);

            // 진행 상황 브로드캣스트
            chrome.runtime.sendMessage({
                action: 'batchProgress',
                data: {
                    current,
                    total: productTabs.length,
                    percentage,
                    currentTab: tab.title || 'Loading...',
                    status: '수집 중...'
                }
            }).catch(() => { }); // 팝업이 닫혀있을 수 있음

            try {
                // 탭 활성화
                await chrome.tabs.update(tab.id, { active: true });
                await delay(1000);

                // 수집 메시지 전송
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'trigger_product'
                });

                results.success++;
                await delay(3000); // 다음 탭 대기

            } catch (error) {
                console.error(`[ServiceWorker] 탭 "${tab.title}" 수집 실패:`, error);
                results.failed++;
                results.errors.push({
                    tab: tab.title || tab.url,
                    error: error.message
                });
            }
        }

        console.log('[ServiceWorker] 배치 수집 완료:', results);
        sendResponse({ success: true, results });

    } catch (error) {
        console.error('[ServiceWorker] 배치 수집 오류:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 상품 페이지 판별
 */
function isProductPage(url) {
    if (!url) return false;

    const patterns = [
        /aliexpress\.com\/item\//,
        /taobao\.com\/item/,
        /1688\.com\/offer\//,
        /tmall\.com\/item/,
        /detail\.tmall\.com/
    ];

    return patterns.some(pattern => pattern.test(url));
}

/**
 * 딜레이 함수
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[ServiceWorker] 로드 완료');
