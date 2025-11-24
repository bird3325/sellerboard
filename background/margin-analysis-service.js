/**
 * 마진 분석 서비스
 * 다중 플랫폼 가격 비교 및 마진 계산
 */

class MarginAnalysisService {
    constructor() {
        this.initialized = false;
        this.costSettings = {};
        this.marginThresholds = {
            excellent: 40,  // 40% 이상 우수
            good: 25,       // 25% 이상 양호
            fair: 15,       // 15% 이상 보통
            low: 5          // 5% 이상 낮음
        };
    }

    /**
     * 초기화
     */
    async initialize() {
        if (this.initialized) return;

        // 비용 설정 로드
        await this.loadCostSettings();

        this.initialized = true;
        console.log('[MarginAnalysisService] Initialized');
    }

    /**
     * 비용 설정 로드
     */
    async loadCostSettings() {
        const result = await chrome.storage.sync.get(['marginCostSettings']);
        this.costSettings = result.marginCostSettings || {
            defaultCommission: {
                naver: 5.6,        // 네이버 5.6%
                coupang: 10,       // 쿠팡 10%
                gmarket: 9,        // G마켓 9%
                auction: 9,        // 옥션 9%
                '11st': 8          // 11번가 8%
            },
            shipping: {
                domestic: 2500,    // 국내 배송비
                china: 3000,       // 중국 배송비
                express: 5000      // 특급 배송비
            },
            packaging: 500,        // 포장 재료비
            laborCost: 1000,       // 인건비
            etc: 0                 // 기타 비용
        };
    }

    /**
     * 비용 설정 저장
     */
    async saveCostSettings(settings) {
        this.costSettings = { ...this.costSettings, ...settings };
        await chrome.storage.sync.set({ marginCostSettings: this.costSettings });
        console.log('[MarginAnalysisService] Cost settings saved');
    }

    /**
     * 마진 계산
     * @param {Object} params - 계산 파라미터
     */
    calculateMargin(params) {
        const {
            sourcingPrice,      // 소싱 가격
            sellingPrice,       // 판매 가격
            platform,           // 판매 플랫폼
            shippingType = 'domestic',
            customCosts = {}    // 커스텀 비용
        } = params;

        // 1. 소싱 비용
        const totalSourcingCost = sourcingPrice;

        // 2. 판매 수수료
        const commissionRate = customCosts.commission || this.costSettings.defaultCommission[platform] || 10;
        const commission = sellingPrice * (commissionRate / 100);

        // 3. 배송비
        const shippingCost = customCosts.shipping || this.costSettings.shipping[shippingType] || 0;

        // 4. 포장비
        const packagingCost = customCosts.packaging !== undefined
            ? customCosts.packaging
            : this.costSettings.packaging;

        // 5. 인건비
        const laborCost = customCosts.labor !== undefined
            ? customCosts.labor
            : this.costSettings.laborCost;

        // 6. 기타 비용
        const etcCost = customCosts.etc || this.costSettings.etc || 0;

        // 총 비용 계산
        const totalCost = totalSourcingCost + commission + shippingCost + packagingCost + laborCost + etcCost;

        // 마진 계산
        const profit = sellingPrice - totalCost;
        const marginRate = (profit / sellingPrice) * 100;

        // 마진 등급
        const grade = this.getMarginGrade(marginRate);

        return {
            sellingPrice,
            costs: {
                sourcing: totalSourcingCost,
                commission: Math.round(commission),
                shipping: shippingCost,
                packaging: packagingCost,
                labor: laborCost,
                etc: etcCost,
                total: Math.round(totalCost)
            },
            profit: Math.round(profit),
            marginRate: Math.round(marginRate * 10) / 10,
            grade,
            isProfit: profit > 0,
            breakdownPercent: {
                sourcing: Math.round((totalSourcingCost / totalCost) * 100),
                commission: Math.round((commission / totalCost) * 100),
                shipping: Math.round((shippingCost / totalCost) * 100),
                other: Math.round(((packagingCost + laborCost + etcCost) / totalCost) * 100)
            }
        };
    }

    /**
     * 마진 등급 판정
     */
    getMarginGrade(marginRate) {
        if (marginRate >= this.marginThresholds.excellent) return 'excellent';
        if (marginRate >= this.marginThresholds.good) return 'good';
        if (marginRate >= this.marginThresholds.fair) return 'fair';
        if (marginRate >= this.marginThresholds.low) return 'low';
        return 'loss';
    }

    /**
     * 다중 소싱 옵션 비교
     * @param {Array} sourcingOptions - 소싱 옵션 목록
     * @param {Object} sellingParams - 판매 조건
     */
    compareMultipleSourcing(sourcingOptions, sellingParams) {
        const comparisons = sourcingOptions.map(option => {
            const margin = this.calculateMargin({
                sourcingPrice: option.price,
                sellingPrice: sellingParams.sellingPrice,
                platform: sellingParams.platform,
                shippingType: option.shippingType || 'domestic'
            });

            return {
                platform: option.platform,
                supplier: option.supplier || 'Unknown',
                price: option.price,
                url: option.url,
                ...margin
            };
        });

        // 마진율 순으로 정렬
        comparisons.sort((a, b) => b.marginRate - a.marginRate);

        return {
            best: comparisons[0],
            options: comparisons,
            summary: {
                bestMargin: comparisons[0].marginRate,
                worstMargin: comparisons[comparisons.length - 1].marginRate,
                averageMargin: comparisons.reduce((sum, c) => sum + c.marginRate, 0) / comparisons.length,
                profitableCount: comparisons.filter(c => c.isProfit).length
            }
        };
    }

    /**
     * 상품 마진 분석
     * @param {Object} product - 분석할 상품
     * @param {Object} options - 분석 옵션
     */
    async analyzeProduct(product, options = {}) {
        const {
            sellingPrice = product.price * 1.5,  // 기본 50% 마진
            platform = 'naver',
            findAlternatives = true              // 대안 소싱 찾기
        } = options;

        // 기본 마진 계산
        const baseMargin = this.calculateMargin({
            sourcingPrice: product.price,
            sellingPrice,
            platform
        });

        const analysis = {
            productId: product.id,
            productName: product.name,
            sourcePlatform: product.platform,
            sourcePrice: product.price,
            sellingPrice,
            targetPlatform: platform,
            margin: baseMargin,
            timestamp: Date.now()
        };

        // 대안 소싱 찾기 (같은 상품을 다른 플랫폼에서 찾기)
        if (findAlternatives) {
            analysis.alternatives = await this.findAlternativeSourcing(product, platform, sellingPrice);
        }

        // 마진 히스토리에 저장
        await this.saveMarginHistory(analysis);

        return analysis;
    }

    /**
     * 대안 소싱 찾기
     * @param {Object} product - 상품
     * @param {string} targetPlatform - 판매 플랫폼
     * @param {number} sellingPrice - 판매 가격
     */
    async findAlternativeSourcing(product, targetPlatform, sellingPrice) {
        // TODO: 실제로는 다른 플랫폼에서 같은 상품 검색
        // 여기서는 시뮬레이션
        const alternatives = [];

        // 중국 플랫폼 (1688, 타오바오, 알리)에서 찾기
        const chinesePlatforms = ['1688', 'taobao', 'aliexpress'];

        chinesePlatforms.forEach(platform => {
            // 가격 추정 (실제로는 검색 API 사용)
            const estimatedPrice = product.price * (
                platform === '1688' ? 0.6 :      // 1688이 가장 저렴
                    platform === 'taobao' ? 0.8 :     // 타오바오 중간
                        1.0                                // 알리 비슷
            );

            const margin = this.calculateMargin({
                sourcingPrice: estimatedPrice,
                sellingPrice,
                platform: targetPlatform,
                shippingType: 'china'
            });

            alternatives.push({
                platform,
                estimatedPrice: Math.round(estimatedPrice),
                ...margin
            });
        });

        return alternatives.sort((a, b) => b.marginRate - a.marginRate);
    }

    /**
     * 우수 마진 상품 자동 발굴
     * @param {Array} products - 상품 목록
     * @param {Object} criteria - 발굴 기준
     */
    async discoverHighMarginProducts(products, criteria = {}) {
        const {
            minMarginRate = 30,          // 최소 마진율
            targetPlatform = 'naver',
            markupRate = 1.5,            // 기본 판매가 마크업 (50%)
            maxResults = 50
        } = criteria;

        const discoveries = [];

        for (const product of products) {
            // 추정 판매가
            const sellingPrice = Math.round(product.price * markupRate);

            // 마진 분석
            const analysis = await this.analyzeProduct(product, {
                sellingPrice,
                platform: targetPlatform,
                findAlternatives: true
            });

            // 기준 충족 여부 확인
            if (analysis.margin.marginRate >= minMarginRate) {
                discoveries.push({
                    ...analysis,
                    score: this.calculateDiscoveryScore(analysis),
                    confidence: this.calculateConfidence(product)
                });
            }
        }

        // 스코어 순으로 정렬
        discoveries.sort((a, b) => b.score - a.score);

        return {
            total: discoveries.length,
            discoveries: discoveries.slice(0, maxResults),
            criteria,
            timestamp: Date.now()
        };
    }

    /**
     * 발굴 스코어 계산
     * @param {Object} analysis - 마진 분석 결과
     */
    calculateDiscoveryScore(analysis) {
        let score = 0;

        // 마진율 점수 (50점 만점)
        score += Math.min(analysis.margin.marginRate, 50);

        // 절대 수익 점수 (30점 만점)
        const profitScore = Math.min((analysis.margin.profit / 10000) * 30, 30);
        score += profitScore;

        // 대안 소싱 보너스 (20점 만점)
        if (analysis.alternatives && analysis.alternatives.length > 0) {
            const bestAlt = analysis.alternatives[0];
            if (bestAlt.marginRate > analysis.margin.marginRate) {
                score += 20;
            } else {
                score += 10;
            }
        }

        return Math.round(score);
    }

    /**
     * 신뢰도 계산
     */
    calculateConfidence(product) {
        let confidence = 50; // 기본 50%

        // 리뷰 수가 많으면 신뢰도 증가
        if (product.platformMetadata?.reviewCount) {
            confidence += Math.min(product.platformMetadata.reviewCount / 100, 30);
        }

        // 평점이 높으면 신뢰도 증가
        if (product.platformMetadata?.rating) {
            confidence += (product.platformMetadata.rating / 5) * 20;
        }

        return Math.min(Math.round(confidence), 100);
    }

    /**
     * 마진 히스토리 저장
     */
    async saveMarginHistory(analysis) {
        const result = await chrome.storage.local.get(['marginHistory']);
        const history = result.marginHistory || [];

        history.push(analysis);

        // 최근 500개만 유지
        if (history.length > 500) {
            history.splice(0, history.length - 500);
        }

        await chrome.storage.local.set({ marginHistory: history });
    }

    /**
     * 마진 히스토리 가져오기
     */
    async getMarginHistory(filter = {}) {
        const result = await chrome.storage.local.get(['marginHistory']);
        let history = result.marginHistory || [];

        // 필터 적용
        if (filter.productId) {
            history = history.filter(h => h.productId === filter.productId);
        }

        if (filter.minMargin) {
            history = history.filter(h => h.margin.marginRate >= filter.minMargin);
        }

        if (filter.grade) {
            history = history.filter(h => h.margin.grade === filter.grade);
        }

        return history;
    }

    /**
     * 마진 통계
     */
    async getStatistics() {
        const history = await this.getMarginHistory();

        if (history.length === 0) {
            return {
                total: 0,
                averageMargin: 0,
                profitableCount: 0
            };
        }

        const stats = {
            total: history.length,
            averageMargin: history.reduce((sum, h) => sum + h.margin.marginRate, 0) / history.length,
            averageProfit: history.reduce((sum, h) => sum + h.margin.profit, 0) / history.length,
            profitableCount: history.filter(h => h.margin.isProfit).length,
            byGrade: {
                excellent: history.filter(h => h.margin.grade === 'excellent').length,
                good: history.filter(h => h.margin.grade === 'good').length,
                fair: history.filter(h => h.margin.grade === 'fair').length,
                low: history.filter(h => h.margin.grade === 'low').length,
                loss: history.filter(h => h.margin.grade === 'loss').length
            },
            bestProduct: history.reduce((best, current) =>
                current.margin.marginRate > (best?.margin.marginRate || 0) ? current : best
                , null)
        };

        return stats;
    }

    /**
     * 마진 임계값 설정
     */
    setMarginThresholds(thresholds) {
        this.marginThresholds = { ...this.marginThresholds, ...thresholds };
    }
}

// 싱글톤 인스턴스
const marginAnalysisService = new MarginAnalysisService();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarginAnalysisService;
    module.exports.marginAnalysisService = marginAnalysisService;
}
