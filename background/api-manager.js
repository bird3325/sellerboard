/**
 * API 관리자
 * 플랫폼 API 크리덴셜 관리 및 자동 등록 시스템
 */

class ApiManager {
    constructor() {
        this.initialized = false;
        this.platformApis = new Map();
        this.registrationQueue = [];
        this.isProcessing = false;
    }

    /**
     * 초기화
     */
    async initialize() {
        if (this.initialized) return;

        // API 크리덴셜 로드
        await this.loadCredentials();

        // 플랫폼 API 클라이언트 등록
        this.registerPlatformApis();

        this.initialized = true;
        console.log('[ApiManager] Initialized');
    }

    /**
     * API 크리덴셜 로드
     */
    async loadCredentials() {
        const result = await chrome.storage.sync.get(['apiCredentials']);
        this.credentials = result.apiCredentials || {};
        console.log('[ApiManager] Loaded credentials for', Object.keys(this.credentials).length, 'platforms');
    }

    /**
     * 플랫폼 API 클라이언트 등록
     */
    registerPlatformApis() {
        // TODO: 각 플랫폼 API 클라이언트 등록
        // this.platformApis.set('naver', new NaverSmartStoreApi());
        console.log('[ApiManager] Platform APIs registered');
    }

    /**
     * API 크리덴셜 저장
     * @param {string} platform - 플랫폼 ID
     * @param {Object} credentials - API 크리덴셜
     */
    async saveCredentials(platform, credentials) {
        this.credentials[platform] = {
            ...credentials,
            updatedAt: Date.now(),
            encrypted: true // 실제로는 암호화 구현 필요
        };

        await chrome.storage.sync.set({ apiCredentials: this.credentials });
        console.log(`[ApiManager] Saved credentials for ${platform}`);
    }

    /**
     * API 크리덴셜 가져오기
     * @param {string} platform - 플랫폼 ID
     */
    getCredentials(platform) {
        return this.credentials[platform];
    }

    /**
     * API 연결 테스트
     * @param {string} platform - 플랫폼 ID
     */
    async testConnection(platform) {
        const api = this.platformApis.get(platform);
        if (!api) {
            throw new Error(`Platform ${platform} API not found`);
        }

        const credentials = this.getCredentials(platform);
        if (!credentials) {
            throw new Error(`No credentials found for ${platform}`);
        }

        try {
            await api.initialize(credentials);
            const result = await api.testConnection();
            return { success: true, ...result };
        } catch (error) {
            console.error(`[ApiManager] Connection test failed for ${platform}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 상품 자동 등록
     * @param {string} platform - 대상 플랫폼
     * @param {Object} product - 상품 데이터
     * @param {Object} options - 등록 옵션
     */
    async registerProduct(platform, product, options = {}) {
        const api = this.platformApis.get(platform);
        if (!api) {
            throw new Error(`Platform ${platform} API not found`);
        }

        const credentials = this.getCredentials(platform);
        if (!credentials) {
            throw new Error(`No credentials found for ${platform}`);
        }

        console.log(`[ApiManager] Registering product to ${platform}:`, product.name);

        try {
            // API 초기화
            await api.initialize(credentials);

            // 상품 데이터 매핑 및 검증
            const mappedData = await this.mapProductData(platform, product, options);

            // 등록 실행
            const result = await api.registerProduct(mappedData);

            // 등록 로그 저장
            await this.saveRegistrationLog({
                platform,
                productId: product.id,
                status: 'success',
                result,
                timestamp: Date.now()
            });

            console.log(`[ApiManager] Registration successful:`, result);
            return { success: true, ...result };

        } catch (error) {
            console.error(`[ApiManager] Registration failed:`, error);

            // 실패 로그 저장
            await this.saveRegistrationLog({
                platform,
                productId: product.id,
                status: 'failed',
                error: error.message,
                timestamp: Date.now()
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * 상품 데이터 매핑
     * @param {string} platform - 대상 플랫폼
     * @param {Object} product - 원본 상품 데이터
     * @param {Object} options - 매핑 옵션
     */
    async mapProductData(platform, product, options) {
        // 기본 매핑
        const mapped = {
            name: options.customName || product.name,
            price: options.customPrice || product.price,
            description: options.aiDescription || product.description?.text || '',
            images: product.images || [],
            options: product.options || [],
            category: options.category || '',
            shipping: options.shipping || product.shipping,
            stock: options.stock || 'unlimited'
        };

        // 플랫폼별 추가 필드
        switch (platform) {
            case 'naver':
                mapped.deliveryFee = mapped.shipping?.fee || 0;
                mapped.originProduct = {
                    url: product.url,
                    platform: product.platform
                };
                break;

            case 'coupang':
                mapped.vendor = options.vendor || 'default';
                mapped.displayCategoryCode = options.categoryCode;
                break;
        }

        // 데이터 검증
        this.validateProductData(mapped);

        return mapped;
    }

    /**
     * 상품 데이터 검증
     * @param {Object} data - 매핑된 상품 데이터
     */
    validateProductData(data) {
        if (!data.name || data.name.length < 2) {
            throw new Error('상품명은 최소 2자 이상이어야 합니다');
        }

        if (!data.price || data.price <= 0) {
            throw new Error('유효한 가격을 입력해주세요');
        }

        if (!data.images || data.images.length === 0) {
            throw new Error('최소 1개 이상의 이미지가 필요합니다');
        }

        return true;
    }

    /**
     * 등록 로그 저장
     * @param {Object} log - 로그 데이터
     */
    async saveRegistrationLog(log) {
        const result = await chrome.storage.local.get(['registrationLogs']);
        const logs = result.registrationLogs || [];

        logs.push(log);

        // 최근 1000개만 유지
        if (logs.length > 1000) {
            logs.splice(0, logs.length - 1000);
        }

        await chrome.storage.local.set({ registrationLogs: logs });
    }

    /**
     * 등록 로그 가져오기
     * @param {Object} filter - 필터 옵션
     */
    async getRegistrationLogs(filter = {}) {
        const result = await chrome.storage.local.get(['registrationLogs']);
        let logs = result.registrationLogs || [];

        // 필터 적용
        if (filter.platform) {
            logs = logs.filter(log => log.platform === filter.platform);
        }

        if (filter.status) {
            logs = logs.filter(log => log.status === filter.status);
        }

        if (filter.productId) {
            logs = logs.filter(log => log.productId === filter.productId);
        }

        return logs;
    }

    /**
     * 대량 등록
     * @param {string} platform - 대상 플랫폼
     * @param {Array} products - 상품 목록
     * @param {Object} options - 등록 옵션
     */
    async bulkRegister(platform, products, options = {}) {
        console.log(`[ApiManager] Starting bulk registration: ${products.length} products to ${platform}`);

        const results = {
            total: products.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (const product of products) {
            try {
                const result = await this.registerProduct(platform, product, options);

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                }

                results.details.push({
                    productId: product.id,
                    productName: product.name,
                    ...result
                });

                // Rate limiting (플랫폼별 API 제한 준수)
                await this.sleep(options.delay || 1000);

            } catch (error) {
                results.failed++;
                results.details.push({
                    productId: product.id,
                    productName: product.name,
                    success: false,
                    error: error.message
                });
            }
        }

        console.log(`[ApiManager] Bulk registration completed:`, results);
        return results;
    }

    /**
     * 통계 가져오기
     */
    async getStatistics() {
        const logs = await this.getRegistrationLogs();

        const stats = {
            total: logs.length,
            success: logs.filter(log => log.status === 'success').length,
            failed: logs.filter(log => log.status === 'failed').length,
            byPlatform: {}
        };

        // 플랫폼별 통계
        for (const log of logs) {
            if (!stats.byPlatform[log.platform]) {
                stats.byPlatform[log.platform] = { total: 0, success: 0, failed: 0 };
            }
            stats.byPlatform[log.platform].total++;
            stats.byPlatform[log.platform][log.status]++;
        }

        return stats;
    }

    /**
     * Sleep 유틸리티
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 싱글톤 인스턴스
const apiManager = new ApiManager();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiManager;
    module.exports.apiManager = apiManager;
}
