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

        // 4. 위젯 HTML 구조
        const container = document.createElement('div');
        container.className = 'sb-container';
        container.style.cssText = 'pointer-events: auto;'; // 내부 요소는 클릭 가능하게

        container.innerHTML = `
            <!-- 위젯 버튼 -->
            <div id="sb-widget" style="position:fixed !important; z-index:2147483647 !important; top:20px !important; right:20px !important; display:block !important; pointer-events:auto !important; visibility:visible !important; opacity:1 !important;">
                <div id="sb-btn" class="sb-btn-float" style="
                    width: 50px !important;
                    height: 50px !important;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                    border-radius: 50% !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    color: white !important;
                    font-size: 24px !important;
                    font-weight: bold !important;
                    cursor: grab !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                    user-select: none !important;
                    pointer-events: auto !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                ">S</div>
            </div>

            <!-- 팝업 -->
            <div id="sb-popup" class="sb-popup-container" style="position:fixed !important; top:80px !important; right:20px !important; display:none !important; pointer-events:auto !important; z-index:2147483647 !important;">
                <div id="sb-header" class="sb-popup-header">
                    <div class="sb-popup-title">
                        <div class="sb-popup-logo">S</div>
                        셀러보드
                    </div>
                    <button id="sb-close" class="sb-popup-close">✕</button>
                </div>
                <div class="sb-popup-body">
                    <div class="sb-button-group">
                        <button id="sb-collect" class="sb-btn primary">
                            <span>📦</span> 상품 수집
                        </button>
                        <button id="sb-drag" class="sb-btn warning">
                            <span>🎯</span> 영역 선택
                        </button>
                    </div>
                    <div class="sb-stats-grid">
                        <div class="sb-stat-card">
                            <div id="sb-today" class="sb-stat-number">0</div>
                            <div class="sb-stat-label">오늘 수집</div>
                        </div>
                        <div class="sb-stat-card">
                            <div id="sb-total" class="sb-stat-number">0</div>
                            <div class="sb-stat-label">총 상품</div>
                        </div>
                    </div>
                    <div class="sb-settings">
                        <div class="sb-settings-item">
                            <span class="sb-settings-label">대시보드</span>
                            <button id="sb-dashboard" class="sb-btn secondary">열기 →</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        shadowRoot.appendChild(container);
        document.body.appendChild(hostElement);
        console.log('[셀러보드] ✅ Shadow DOM 위젯 추가 완료');

        // 스타일 강제 적용 (AliExpress가 스타일을 변경하지 못하도록)
        const widget = container.querySelector('#sb-widget');
        const btn = container.querySelector('#sb-btn');

        function enforceStyles() {
            if (widget) {
                widget.style.setProperty('display', 'block', 'important');
                widget.style.setProperty('visibility', 'visible', 'important');
                widget.style.setProperty('opacity', '1', 'important');
                widget.style.setProperty('position', 'fixed', 'important');
                widget.style.setProperty('z-index', '2147483647', 'important');
                widget.style.setProperty('pointer-events', 'auto', 'important');
            }
            if (btn) {
                btn.style.setProperty('display', 'flex', 'important');
                btn.style.setProperty('visibility', 'visible', 'important');
                btn.style.setProperty('opacity', '1', 'important');
            }
        }

        // 초기 강제 적용
        enforceStyles();

        // 100ms마다 스타일 강제 (매우 공격적)
        setInterval(enforceStyles, 100);

        // 5. 요소 참조 및 이벤트 연결
        setupWidgetEvents(shadowRoot);

        // 6. 감시 및 복구 시작
        startObserver();
    }

    function setupWidgetEvents(root) {
        const widget = root.querySelector('#sb-widget');
        const btn = root.querySelector('#sb-btn');
        const popup = root.querySelector('#sb-popup');
        const header = root.querySelector('#sb-header');
        const closeBtn = root.querySelector('#sb-close');
        const collectBtn = root.querySelector('#sb-collect');
        const dragBtn = root.querySelector('#sb-drag');
        const dashboardBtn = root.querySelector('#sb-dashboard');

        if (!widget || !popup) return;

        // 상태
        let isOpen = false;
        let dragging = false;
        let dragType = null;
        let startX = 0, startY = 0, initX = 0, initY = 0;

        // 위치 복원
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['widgetPos'], (r) => {
                if (r.widgetPos) {
                    widget.style.left = r.widgetPos.left + 'px';
                    widget.style.top = r.widgetPos.top + 'px';
                    widget.style.right = 'auto';
                }
            });
        }

        // 통계 업데이트
        function updateStats() {
            if (chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ action: 'getStats' }, (r) => {
                    if (r) {
                        const todayEl = root.querySelector('#sb-today');
                        const totalEl = root.querySelector('#sb-total');
                        if (todayEl) todayEl.textContent = r.today || 0;
                        if (totalEl) totalEl.textContent = r.total || 0;
                    }
                });
            }
        }

        // 팝업 제어
        const widgetControl = {
            open: () => {
                isOpen = true;
                popup.style.display = 'block';
                popup.classList.add('sb-enter');
                popup.classList.remove('sb-exit');
                popup.classList.add('active');
                btn.style.display = 'none';
                updateStats();
            },
            close: () => {
                isOpen = false;
                popup.classList.add('sb-exit');
                popup.classList.remove('sb-enter');
                popup.classList.remove('active');
                setTimeout(() => {
                    if (!isOpen) {
                        popup.style.display = 'none';
                        btn.style.display = 'flex';
                    }
                }, 200);
            }
        };

        // 드래그 로직
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            dragType = 'widget';
            const r = widget.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initX = r.left;
            initY = r.top;
            btn.style.cursor = 'grabbing';
            e.preventDefault();
        });

        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.id === 'sb-close') return;
            dragging = true;
            dragType = 'popup';
            const r = popup.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initX = r.left;
            initY = r.top;
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // 전역 이벤트 (Shadow DOM 밖에서도 드래그가 끊기지 않도록 window에 연결)
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let x = initX + dx;
            let y = initY + dy;

            if (dragType === 'widget') {
                x = Math.max(0, Math.min(x, window.innerWidth - 50));
                y = Math.max(0, Math.min(y, window.innerHeight - 50));
                widget.style.left = x + 'px';
                widget.style.top = y + 'px';
                widget.style.right = 'auto';
            } else if (dragType === 'popup') {
                x = Math.max(0, Math.min(x, window.innerWidth - 320));
                y = Math.max(0, Math.min(y, window.innerHeight - popup.offsetHeight));
                popup.style.left = x + 'px';
                popup.style.top = y + 'px';
                popup.style.right = 'auto';
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (dragging && dragType === 'widget') {
                const moved = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;
                dragging = false;
                dragType = null;
                btn.style.cursor = 'grab';

                const r = widget.getBoundingClientRect();
                chrome.storage.local.set({ widgetPos: { left: r.left, top: r.top } });

                if (!moved) widgetControl.open();
            } else if (dragging) {
                dragging = false;
                dragType = null;
                header.style.cursor = 'move';
            }
        });

        // 버튼 이벤트
        btn.addEventListener('mouseenter', () => !dragging && (btn.style.transform = 'scale(1.1)'));
        btn.addEventListener('mouseleave', () => !dragging && (btn.style.transform = 'scale(1)'));

        closeBtn.addEventListener('click', () => widgetControl.close());

        collectBtn.addEventListener('click', async () => {
            collectBtn.innerHTML = '<span>⏳</span> 수집 중...';
            collectBtn.disabled = true;
            try {
                // V2.0: parserManager 사용
                if (typeof parserManager !== 'undefined') {
                    const data = await parserManager.parseCurrentPage();
                    chrome.runtime.sendMessage({ action: 'saveProduct', data }, (r) => {
                        if (r?.success) {
                            collectBtn.innerHTML = '<span>✓</span> 완료!';
                            collectBtn.classList.add('success');
                            setTimeout(() => {
                                collectBtn.innerHTML = '<span>📦</span> 상품 수집';
                                collectBtn.classList.remove('success');
                                collectBtn.disabled = false;
                                updateStats();
                            }, 2000);
                        } else {
                            throw new Error(r?.error || '저장 실패');
                        }
                    });
                } else {
                    throw new Error('ParserManager not loaded');
                }
            } catch (e) {
                console.error('수집 실패:', e);
                collectBtn.innerHTML = '<span>✗</span> 실패';
                collectBtn.classList.add('error');
                alert('상품 수집 실패:\n' + e.message);
                setTimeout(() => {
                    collectBtn.innerHTML = '<span>📦</span> 상품 수집';
                    collectBtn.classList.remove('error');
                    collectBtn.disabled = false;
                }, 2000);
            }
        });

        dragBtn.addEventListener('click', () => {
            if (window.dragSelector) window.dragSelector.toggle();
            widgetControl.close();
        });

        dashboardBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openDashboard' });
        });

        // Storage 변경 감지
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && (changes.products || changes.stats)) {
                updateStats();
            }
        });
    }

    function startObserver() {
        // 호스트 요소가 삭제되면 즉시 복구
        const observer = new MutationObserver((mutations) => {
            if (!document.getElementById(HOST_ID)) {
                console.log('[셀러보드] ⚠️ 위젯 호스트 제거됨, 즉시 복구...');
                // 즉시 재추가
                if (hostElement && !document.body.contains(hostElement)) {
                    document.body.appendChild(hostElement);
                    console.log('[셀러보드] ✅ 위젯 재추가 완료');
                } else {
                    // 호스트가 없으면 완전히 재생성
                    initWidget();
                }
            }
        });

        // childList와 subtree 모두 감시
        observer.observe(document.body, {
            childList: true,
            subtree: false  // body의 직접 자식만 감시
        });

        // 더 빈번한 주기적 체크 (AliExpress 등 강력한 삭제 스크립트 대응)
        setInterval(() => {
            if (!document.getElementById(HOST_ID)) {
                console.log('[셀러보드] 🔄 주기적 체크 -> 위젯 복구');
                if (hostElement && !document.body.contains(hostElement)) {
                    document.body.appendChild(hostElement);
                } else {
                    initWidget();
                }
            }
        }, 500);  // 500ms마다 체크 (더 빈번하게)

        // 추가: 호스트를 body 맨 끝으로 지속적으로 이동
        setInterval(() => {
            if (hostElement && document.body.contains(hostElement)) {
                // 맨 끝으로 이동 (다른 요소들 뒤에 위치)
                document.body.appendChild(hostElement);
            }
        }, 1000);  // 1초마다 맨 끝으로 이동
    }

    // 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }

})();
