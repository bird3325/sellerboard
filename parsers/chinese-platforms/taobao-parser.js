/**
 * 타오바오 파서
 * Taobao 상품 페이지에서 정보 추출
 * TMall 겸용 (동일한 구조 공유)
 */

class TaobaoParser extends BaseParser {
    constructor() {
        super('taobao');
    }

    getSelectors() {
        return {
            name: '.tb-main-title, h1[data-title]',
            price: '.tb-rmb-num, .price-now',
            images: '.tb-booth img, .main-pic img',
            stock: '.tb-amount, .stock-info',
            description: '.tb-detail, .description',
            category: '.breadcrumb, .crumb-wrap'
        };
    }

    async extractName() {
        await this.wait(1000);

        const selectors = [
            '.tb-main-title',
            'h1[data-title]',
            '.mainpic-product-name h1',
            'h3.tb-item-title'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        return '商品名称未找到';
    }

    async extractPrice() {
        const selectors = [
            '.tb-rmb-num',
            '.price-now',
            '.tb-price',
            'em.tb-rmb-num'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const priceText = element.textContent.trim();
                const price = this.parsePrice(priceText);
                if (price > 0) return price;
            }
        }

        // 가격 범위 처리
        const priceRangeEl = document.querySelector('.tb-range-price, .price-range');
        if (priceRangeEl) {
            const text = priceRangeEl.textContent;
            const match = text.match(/(\d+\.?\d*)/);
            if (match) {
                return parseFloat(match[1]);
            }
        }

        return 0;
    }

    async extractOptions() {
        const options = [];

        // SKU 속성 (颜色分类, 尺码 등)
        const skuGroups = document.querySelectorAll('.tb-sku li.tb-prop, ul[data-property]');

        skuGroups.forEach(group => {
            const nameEl = group.querySelector('dt, .tb-property-type');
            const name = nameEl ? nameEl.textContent.replace(':', '').trim() : '规格';

            const values = [];
            const valueEls = group.querySelectorAll('dd, li');

            valueEls.forEach(el => {
                const value = el.getAttribute('data-value') || el.textContent.trim();
                const disabled = el.classList.contains('tb-disabled');

                if (value && !value.includes('请选择')) {
                    values.push({
                        value,
                        price: 0,
                        stock: disabled ? 'out_of_stock' : 'in_stock',
                        imageUrl: el.querySelector('img')?.src || null
                    });
                }
            });

            if (values.length > 0) {
                options.push({ name, values });
            }
        });

        return options;
    }

    async extractShipping() {
        const shipping = {
            fee: 0,
            freeThreshold: 0,
            type: 'standard',
            isTmall: false,
            location: ''  // 发货地
        };

        // TMall 여부 확인
        shipping.isTmall = window.location.hostname.includes('tmall') ||
            !!document.querySelector('.tm-logo, .tmall-logo');

        // 배송비 정보
        const shippingEl = document.querySelector('.tb-postage, .shipping-info');
        if (shippingEl) {
            const text = shippingEl.textContent;

            if (text.includes('包邮') || text.includes('免运费')) {
                shipping.fee = 0;
                shipping.type = 'free';
            } else {
                const feeMatch = text.match(/¥?\s*(\d+\.?\d*)/);
                if (feeMatch) {
                    shipping.fee = parseFloat(feeMatch[1]);
                }
            }
        }

        // 발송지
        const locationEl = document.querySelector('.tb-location, .ship-from');
        if (locationEl) {
            shipping.location = locationEl.textContent.trim();
        }

        return shipping;
    }

    async extractSpecs() {
        const specs = {};

        // 상품 속성
        const specItems = document.querySelectorAll('.tb-property-type, .tb-detail-hd');
        specItems.forEach(item => {
            const label = item.querySelector('.tb-property-type');
            const value = item.querySelector('.tb-property-value');

            if (label && value) {
                const key = label.textContent.replace(':', '').trim();
                const val = value.textContent.trim();
                if (key && val) {
                    specs[key] = val;
                }
            }
        });

        return specs;
    }

    async extractStock() {
        const stockEl = document.querySelector('.tb-amount, .tb-stock');
        if (stockEl) {
            const text = stockEl.textContent;

            if (text.includes('无货') || text.includes('已下架')) {
                return 'out_of_stock';
            }

            const match = text.match(/(\d+)/);
            if (match) {
                const stock = parseInt(match[1]);
                return stock > 0 ? 'in_stock' : 'out_of_stock';
            }
        }

        // 구매 버튼 상태
        const buyButton = document.querySelector('.tb-btn-buy, #J_LinkBuy');
        if (buyButton && buyButton.classList.contains('tb-disabled')) {
            return 'out_of_stock';
        }

        return 'in_stock';
    }

    async extractPlatformSpecificData() {
        const metadata = {
            reviewCount: 0,
            rating: 0,
            monthSales: 0,  // 月销量
            seller: '',
            shopScore: 0,
            isTmall: false,
            wangwangId: '',  // 旺旺号
            currency: 'CNY'
        };

        // TMall 여부
        metadata.isTmall = window.location.hostname.includes('tmall') ||
            !!document.querySelector('.tm-logo, .tmall-logo');

        // 리뷰 수
        const reviewEl = document.querySelector('.tb-rate-counter, .rate-counter');
        if (reviewEl) {
            const reviewText = reviewEl.textContent.replace(/[^\d]/g, '');
            metadata.reviewCount = parseInt(reviewText) || 0;
        }

        // 평점
        const ratingEl = document.querySelector('.tb-rate-score, .rate-score');
        if (ratingEl) {
            metadata.rating = parseFloat(ratingEl.textContent) || 0;
        }

        // 월 판매량
        const salesEl = document.querySelector('.tb-sell-counter, .month-sell-count');
        if (salesEl) {
            const salesText = salesEl.textContent.replace(/[^\d]/g, '');
            metadata.monthSales = parseInt(salesText) || 0;
        }

        // 판매자 정보
        const sellerEl = document.querySelector('.tb-shop-name, .shop-name');
        if (sellerEl) {
            metadata.seller = sellerEl.textContent.trim();
        }

        // 상점 평점
        const shopScoreEl = document.querySelector('.tb-shop-rate, .shop-rate-score');
        if (shopScoreEl) {
            metadata.shopScore = parseFloat(shopScoreEl.textContent) || 0;
        }

        // 왕왕(wangwang) ID - 타오바오 메신저
        const wangwangEl = document.querySelector('.tb-wangwang, a[href*="wangwang"]');
        if (wangwangEl) {
            metadata.wangwangId = wangwangEl.getAttribute('data-nick') ||
                wangwangEl.textContent.trim();
        }

        return metadata;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaobaoParser;
}
