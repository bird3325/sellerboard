/**
 * AliExpress 상세설명 추출 - 수정된 버전
 * 
 * 사용법:
 * aliexpress-parser.js 파일에서 extractDescription 함수를
 * 아래 코드로 완전히 교체하세요 (281-430줄).
 */

async extractDescription() {
    this.log('\n========== 상세 설명 추출 시작 ==========');
    const d = { text: '', html: '', images: [] };

    try {
        // 1. 펼치기 버튼 클릭
        this.log('Step 1: 펼치기 버튼 클릭...');
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const expanders = buttons.filter(b => {
            const t = b.textContent.trim().toLowerCase();
            return t === 'view more' || t === 'show more' || t === '더보기';
        });

        for (const btn of expanders) {
            if (btn && btn.offsetParent !== null) {
                try {
                    btn.click();
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) { }
            }
        }

        let descEl = null;

        // 2. Shadow DOM 탐색 (우선순위 높음)
        this.log('\nStep 2: Shadow DOM 탐색...');
        const shadowRoots = [];

        // 모든 요소에서 Shadow Root 찾기
        document.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) shadowRoots.push(el.shadowRoot);
        });

        this.log(`  발견: ${shadowRoots.length}개 Shadow Root`);

        // Shadow Root 내부 검색
        for (let i = 0; i < shadowRoots.length; i++) {
            const root = shadowRoots[i];
            this.log(`  Shadow #${i + 1} 검사...`);

            // 우선순위 1: #product-description → .detail-desc-decorate-richtext
            const productDesc = root.querySelector('#product-description');
            if (productDesc) {
                this.log('    ✓ #product-description 발견');
                const richtext = productDesc.querySelector('.detail-desc-decorate-richtext');
                if (richtext && richtext.textContent.trim().length > 50) {
                    this.log(`    ✅ 성공! ${richtext.textContent.length}자`);
                    descEl = richtext;
                    break;
                }

                const detailmodule = productDesc.querySelector('.detailmodule_html');
                if (detailmodule && detailmodule.textContent.trim().length > 50) {
                    this.log(`    ✅ 성공! ${detailmodule.textContent.length}자`);
                    descEl = detailmodule;
                    break;
                }
            }

            //우선순위 2: 직접 검색
            const richtext = root.querySelector('.detail-desc-decorate-richtext');
            if (richtext && richtext.textContent.trim().length > 50) {
                this.log(`    ✅ 직접 발견! ${richtext.textContent.length}자`);
                descEl = richtext;
                break;
            }
        }

        // 3. 일반 DOM 검색
        if (!descEl) {
            this.log('\nStep 3: 일반 DOM 검색...');
            const selectors = [
                '#product-description .detail-desc-decorate-richtext',
                '.detail-desc-decorate-richtext',
                '.detailmodule_html',
                '#product-description'
            ];

            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim().length > 100) {
                    this.log(`  ✅ ${sel} 발견!`);
                    descEl = el;
                    break;
                }
            }
        }

        // 4. 데이터 추출
        if (descEl) {
            d.text = descEl.textContent.trim().substring(0, 5000);
            d.html = descEl.innerHTML;

            // 이미지
            const imgs = descEl.querySelectorAll('img');
            imgs.forEach(img => {
                const src = img.src || img.dataset.src;
                if (src && !src.includes('data:image')) {
                    d.images.push(src);
                }
            });

            this.log(`\n✅ 추출 성공!`);
            this.log(`  텍스트: ${d.text.length}자`);
            this.log(`  HTML: ${d.html.length}자`);
            this.log(`  이미지: ${d.images.length}개`);
        } else {
            this.log('\n❌ 실패: 상세설명을 찾을 수 없음');
        }

    } catch (e) {
        this.log('❌ 오류:', e.message);
    }

    return d;
}
