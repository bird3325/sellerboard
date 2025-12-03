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

console.log('[ServiceWorker] 로드 완료');
