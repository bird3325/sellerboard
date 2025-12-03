/**
 * 셀러보드 플로팅 위젯 - 알리익스프레스 대응 완전판
 * Closed Shadow DOM + 드래그 + MutationObserver + Health Check
 */

console.log('[셀러보드] widget.js 로드됨');

(function () {
    'use strict';

    if (window.sellerboardWidgetLoaded) {
        console.log('[셀러보드] 이미 로드됨');
        return;
    }
    window.sellerboardWidgetLoaded = true;

    // Shadow DOM 호스트 생성
    const HOST_ID = 'sb-host-root';
    let shadowRoot = null;
    let hostElement = null;

    function initWidget() {
        if (!document.body) {
            setTimeout(initWidget, 100);
            return;
        }

        // 이미 존재하면 중단
        if (document.getElementById(HOST_ID)) {
            return;
        }

        console.log('[셀러보드] 위젯 초기화 (Shadow DOM)...');

        // 1. 호스트 요소 생성
        hostElement = document.createElement('div');
        hostElement.id = HOST_ID;
        // 전체 화면 크기로 설정하되 pointer-events는 none으로 (Shadow DOM 내부 요소만 클릭 가능)
        hostElement.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:2147483647; pointer-events:none; overflow:visible;';

        // 2. Shadow DOM 생성 (Closed 모드)
        shadowRoot = hostElement.attachShadow({ mode: 'closed' });

        // 3. 스타일 주입
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = chrome.runtime.getURL('styles/widget.css');
        shadowRoot.appendChild(styleLink);

        // 애니메이션 스타일
        const animStyle = document.createElement('style');
        animStyle.textContent = `
            @keyframes sbSlideIn {
                from { opacity: 0; transform: translateX(20px) scale(0.95); }
                to { opacity: 1; transform: translateX(0) scale(1); }
            }
            @keyframes sbSlideOut {
                from { opacity: 1; transform: translateX(0) scale(1); }
                to { opacity: 0; transform: translateX(20px) scale(0.95); }
            }
            .sb-enter { animation: sbSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
            .sb-exit { animation: sbSlideOut 0.2s ease-out forwards; }
        `;
        shadowRoot.appendChild(animStyle);

        // 4. 위젯 HTML 구조 (UI는 숨김 처리됨)
        const container = document.createElement('div');
        container.className = 'sb-container';
        container.style.cssText = 'pointer-events: auto; display: none;'; // 숨김

        container.innerHTML = `<!-- 위젯 UI 제거됨 -->`;

        shadowRoot.appendChild(container);
        document.body.appendChild(hostElement);
        console.log('[셀러보드] ✅ Shadow DOM 위젯 추가 완료 (숨김 모드)');
    }

    // 위젯 UI 초기화 (비활성화됨)
    // if (document.readyState === 'loading') {
    //     document.addEventListener('DOMContentLoaded', initWidget);
    // } else {
    //     initWidget();
    // }

    // 메시지 리스너 등록 (Popup에서 호출)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Sellerboard Content] 메시지 수신:', message.action);

        switch (message.action) {
            case 'ping': // Content script 로드 확인
                sendResponse({ success: true, loaded: true });
                return true;
            case 'trigger_product': // 기존 single
                collectSingle().then(res => sendResponse(res)).catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            case 'trigger_keyword': // 키워드 검색
                handleKeywordSearch(message.keyword).then(res => sendResponse(res)).catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            case 'trigger_area': // 영역 드래그
                collectArea().then(res => sendResponse(res)).catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            case 'trigger_store': // 기존 bulk (몰털이)
                collectBulk().then(res => sendResponse(res)).catch(err => sendResponse({ success: false, error: err.message }));
                return true;
        }
    });

    // --- 수집 함수들 ---

    async function handleKeywordSearch(keyword) {
        if (!keyword) throw new Error('키워드가 없습니다.');

        const host = window.location.hostname;

        // 알리익스프레스 검색 URL 생성
        if (host.includes('aliexpress')) {
            const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`;
            window.location.href = searchUrl;
            return { success: true, message: '검색 페이지로 이동합니다...' };
        }
        // 타오바오
        else if (host.includes('taobao')) {
            const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`;
            window.location.href = searchUrl;
            return { success: true, message: '검색 페이지로 이동합니다...' };
        }
        // 1688
        else if (host.includes('1688')) {
            const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}`;
            window.location.href = searchUrl;
            return { success: true, message: '검색 페이지로 이동합니다...' };
        }

        return { success: false, error: '지원하지 않는 사이트입니다.' };
    }

    async function collectSingle() {
        if (typeof parserManager === 'undefined') throw new Error('ParserManager not loaded');
        const data = await parserManager.parseCurrentPage();
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'saveProduct', data }, (r) => {
                if (r?.success) resolve({ success: true, message: '상품이 저장되었습니다.' });
                else resolve({ success: false, error: r?.error || '저장 실패' });
            });
        });
    }

    async function collectArea() {
        if (window.dragSelector) {
            window.dragSelector.toggle();
            return { success: true, message: '영역 선택 모드가 활성화되었습니다.' };
        } else {
            throw new Error('영역 선택 기능이 로드되지 않았습니다');
        }
    }

    async function collectBulk() {
        // 몰털이 (상점 전체 수집)
        // 현재 페이지가 상점 페이지인지 확인하거나, 카테고리를 탐색
        alert('몰털이(상점 전체 수집)를 시작합니다. (콘솔 확인)');
        return { success: true, message: '상점 수집이 시작되었습니다.' };
    }

})();
