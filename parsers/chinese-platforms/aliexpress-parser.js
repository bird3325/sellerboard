/**
 * 알리익스프레스 파서
 * AliExpress 상품 페이지에서 정보 추출
 * 다국어 및 동적 로딩 처리 필요
 */

class AliexpressParser extends BaseParser {
    constructor() {
        super('aliexpress');
    }

    getSelectors() {
        return {
            name: '.product-title-text, h1[data-pl="product-title"]',
            price: '.product-price-value, .price--currentPriceText--V8_y_b5',
            images: '.images-view-item img, .magnifier-image',
            stock: '.product-quantity-tip, .quantity--stock',
            description: '.product-description, .detail-desc-decorate-richtext',
            category: '.breadcrumb, nav[aria-label="breadcrumb"]'
        };
    }

    async extractName() {
        // 동적 로딩 대기
        await this.wait(1000);

        const selectors = [
            'h1[data-pl="product-title"]',
            '.product-title-text',
            'h1.product-title',
            '.title--wrap--Ms9Zv4A h1'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        return 'Product name not found';
    }

    async extractPrice() {
        // 가격 로딩 대기
        await this.wait(500);

        const selectors = [
            '.price--currentPriceText--V8_y_b5',
            '.product-price-value',
            '.product-price .price-current',
            'span[itemprop="price"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const priceText = element.textContent.trim();
                const price = this.parsePrice(priceText);
                if (price > 0) return price;
            }
        }

        return 0;
    }

    async extractOptions() {
        const options = [];

        // SKU 속성 (색상, 사이즈 등)
        const skuGroups = document.querySelectorAll('.sku-property, div[class*="sku-item"]');

        skuGroups.forEach(group => {
            const nameEl = group.querySelector('.sku-property-text, .sku-title');
            const name = nameEl ? nameEl.textContent.trim() : 'Option';

            const values = [];
            const valueEls = group.querySelectorAll('.sku-property-item, .sku-value');

            valueEls.forEach(el => {
                const value = el.getAttribute('title') || el.textContent.trim();
                const disabled = el.classList.contains('disabled') || el.classList.contains('notAvailable');

                if (value) {
                    values.push({
                        value,
                        price: 0,  // 알리는 가격 변동이 있을 수 있음
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
            estimatedDays: '',
            methods: []
        };

        // 배송비 및 배송 시간
        const shippingEl = document.querySelector('.product-shipping, .dynamic-shipping');
        if (shippingEl) {
            const text = shippingEl.textContent;

            if (text.includes('Free shipping') || text.includes('무료 배송')) {
                shipping.fee = 0;
                shipping.type = 'free';
            } else {
                const feeMatch = text.match(/\$?\s*(\d+\.?\d*)/);
                if (feeMatch) {
                    shipping.fee = parseFloat(feeMatch[1]);
                }
            }

            // 배송 기간
            const daysMatch = text.match(/(\d+)-(\d+)\s*days/i);
            if (daysMatch) {
                shipping.estimatedDays = `${daysMatch[1]}-${daysMatch[2]} days`;
            }
        }

        // 배송 방법
        const methodEls = document.querySelectorAll('.shipping-method-item, .logistics-item');
        methodEls.forEach(el => {
            shipping.methods.push({
                name: el.querySelector('.method-name')?.textContent.trim() || '',
                price: this.parsePrice(el.querySelector('.method-price')?.textContent || '0'),
                days: el.querySelector('.method-days')?.textContent.trim() || ''
            });
        });

        return shipping;
    }

    async extractSpecs() {
        const specs = {};

        // 상품 속성 테이블
        const specGroups = document.querySelectorAll('.product-prop, .specification-item');
        specGroups.forEach(group => {
            const key = group.querySelector('.propery-title, dt')?.textContent.trim();
            const value = group.querySelector('.propery-des, dd')?.textContent.trim();

            if (key && value) {
                specs[key] = value;
            }
        });

        return specs;
    }

    async extractStock() {
        // 재고 수량 표시
        const stockEl = document.querySelector('.product-quantity-tip, .quantity-info');
        if (stockEl) {
            const text = stockEl.textContent.toLowerCase();

            if (text.includes('only') && text.includes('left')) {
                // "Only 5 left" 형태
                const match = text.match(/only\s+(\d+)\s+left/);
                if (match) {
                    const remaining = parseInt(match[1]);
                    return remaining > 0 ? 'in_stock' : 'out_of_stock';
                }
            }

            if (text.includes('out of stock') || text.includes('sold out')) {
                return 'out_of_stock';
            }
        }

        // 구매 버튼 상태
        const buyButton = document.querySelector('.product-action .add-to-cart, button[data-role="addToCart"]');
        if (buyButton && buyButton.disabled) {
            return 'out_of_stock';
        }

        return 'in_stock';
    }

    async extractPlatformSpecificData() {
        const metadata = {
            reviewCount: 0,
            rating: 0,
            orders: 0,
            seller: '',
            storeName: '',
            storeRating: 0,
            currency: 'USD'
        };

        // 리뷰 수
        const reviewEl = document.querySelector('.overview-rating-count, span[data-pl="review-count"]');
        if (reviewEl) {
            const reviewText = reviewEl.textContent.replace(/[^\d]/g, '');
            metadata.reviewCount = parseInt(reviewText) || 0;
        }

        // 평점
        const ratingEl = document.querySelector('.overview-rating-average, span[data-pl="rating"]');
        if (ratingEl) {
            metadata.rating = parseFloat(ratingEl.textContent) || 0;
        }

        // 주문 수
        const ordersEl = document.querySelector('.product-reviewer-sold, span[data-pl="order-count"]');
        if (ordersEl) {
            const ordersText = ordersEl.textContent.replace(/[^\d]/g, '');
            metadata.orders = parseInt(ordersText) || 0;
        }

        // 판매자 정보
        const sellerEl = document.querySelector('.shop-name, a[data-pl="store-name"]');
        if (sellerEl) {
            metadata.seller = sellerEl.textContent.trim();
            metadata.storeName = metadata.seller;
        }

        // 상점 평점
        const storeRatingEl = document.querySelector('.store-rating, .shop-score');
        if (storeRatingEl) {
            metadata.storeRating = parseFloat(storeRatingEl.textContent) || 0;
        }

        return metadata;
    }

    /**
     * 알리익스프레스는 페이지 로딩이 느리므로 추가 대기 시간 필요
     */
    async parseProduct() {
        // 페이지 완전 로딩 대기
        await this.wait(2000);
        return await super.parseProduct();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AliexpressParser;
}
