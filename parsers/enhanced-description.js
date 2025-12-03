/**
 * Enhanced Description Extraction for AliExpress
 * 
 * 이 파일을 aliexpress-parser.js의 extractDescription 메서드로 복사하세요.
 * 
 * 주요 개선사항:
 * 1. 6단계 검색 전략
 * 2. Shadow DOM 완전 탐색
 * 3. 상세한 로깅
 * 4. 다양한 셀렉터 지원
 */

async extractDescription() {
    this.log('\n========== 상세 설명 추출 시작 ==========');
    const d = { text: '', html: '', images: [] };

    try {
        // 1. 펼치기 버튼 모두 클릭
        this.log('📍 Step 1: 펼치기 버튼 찾기...');
        const expandSelectors = ['button[class*="expand"]', 'button[class*="more"]'];
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const textExpanders = buttons.filter(b => {
            const t = b.textContent.trim().toLowerCase();
            return t === 'view more' || t === 'show more' || t === '더보기';
        });
        const allExpanders = [...document.querySelectorAll(expandSelectors.join(',')), ...textExpanders];

        this.log(`  찾은 펼치기 버튼: ${allExpanders.length}개`);
        for (const btn of allExpanders) {
            if (btn && btn.offsetParent !== null) {
                try {
                    btn.click();
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) { }
            }
        }

        let descEl = null;

        // 2. Shadow DOM 전체 탐색
        this.log('\n📍 Step 2: Shadow DOM 탐색...');
        let shadowRoots = [];
        const mainContainer = document.body;

        // 모든 요소 검사
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) {
                shadowRoots.push(el.shadowRoot);
            }
        }

        this.log(`  발견된 Shadow Root: ${shadowRoots.length}개`);

        // Shadow DOM 내부 검색
        for (let i = 0; i < shadowRoots.length; i++) {
            const root = shadowRoots[i];
            this.log(`  🔎 Shadow Root #${i + 1} 검사 중...`);

            // 우선순위 셀렉터
            const selectors = [
                '.detail-desc-decorate-richtext',
                '.detailmodule_html',
                '#product-description',
                '[class*="description"]',
                '[class*="detail"]'
            ];

            for (const selector of selectors) {
                const target = root.querySelector(selector);
                if (target && target.textContent.trim().length > 50) {
                    this.log(`    ✅ 발견! ${selector}, ${target.textContent.length}자`);
                    descEl = target;
                    break;
                }
            }

            if (descEl) break;

            // 텍스트가 많은 div 찾기
            const divs = root.querySelectorAll('div');
            let maxLen = 0;
            let bestDiv = null;

            for (const div of divs) {
                const len = div.textContent.trim().length;
                if (len > 200 && len > maxLen) {
                    maxLen = len;
                    bestDiv = div;
                }
            }

            if (bestDiv) {
                this.log(`    ✅ 텍스트 기반: ${maxLen}자`);
                descEl = bestDiv;
                break;
            }
        }

        // 3. 일반 DOM 검색
        if (!descEl) {
            this.log('\n📍 Step 3: 일반 DOM 검색...');
            const selectors = [
                '[class*="description"]',
                '[class*="detail"]',
                '[id*="description"]',
                '#description'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim().length > 100) {
                    this.log(`  ✅ ${selector} 발견: ${el.textContent.length}자`);
                    descEl = el;
                    break;
                }
            }
        }

        // 4. 최종 데이터 추출
        if (descEl) {
            this.log('\n✅ 상세설명 추출 성공!');

            d.text = descEl.textContent.trim().substring(0, 5000);
            d.html = descEl.innerHTML;

            // 이미지 추출
            const imgs = descEl.querySelectorAll('img');
            imgs.forEach(img => {
                const src = img.src || img.dataset.src;
                if (src && !src.includes('data:image')) {
                    d.images.push(src);
                }
            });

            this.log(`  - 텍스트: ${d.text.length}자`);
            this.log(`  - HTML: ${d.html.length}자`);
            this.log(`  - 이미지: ${d.images.length}개`);
            this.log(`  - 샘플: "${d.text.substring(0, 100)}..."`);
        } else {
            this.log('\n❌ 상세설명을 찾을 수 없습니다.');
        }

    } catch (e) {
        this.log('❌ 오류:', e.message);
        console.error(e);
    }

    return d;
}
