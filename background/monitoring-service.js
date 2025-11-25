/**
 * 자동 모니터링 서비스
 * 가격/재고 자동 재수집 및 변동 감지 알림
 */

class MonitoringService {
    constructor() {
        this.initialized = false;
        this.monitoringProducts = new Map();
    }

    /**
     * 서비스 초기화
     */
    async initialize() {
        if (this.initialized) return;

        // 저장된 모니터링 목록 불러오기
        await this.loadMonitoringList();

        // 알람 리스너 등록
        this.setupAlarmListener();

        this.initialized = true;
        console.log('[MonitoringService] Initialized');
    }

    /**
     * 모니터링 목록 불러오기
     */
    async loadMonitoringList() {
        const result = await chrome.storage.local.get(['monitoringProducts']);
        const products = result.monitoringProducts || [];

        products.forEach(product => {
            this.monitoringProducts.set(product.id, product);
        });

        console.log(`[MonitoringService] Loaded ${products.length} monitoring products`);
    }

    /**
     * 상품 모니터링 시작
     * @param {Object} product - 모니터링할 상품
     * @param {Object} options - 모니터링 옵션
     */
    async startMonitoring(product, options = {}) {
        const {
            interval = 60,           // 기본 60분마다
            priceAlert = true,       // 가격 변동 알림
            stockAlert = true,       // 재고 변동 알림
            priceThreshold = 0       // 가격 변동 임계값 (0 = 모든 변동 알림)
        } = options;

        // 모니터링 정보 저장
        const monitoringInfo = {
            ...product,
            monitoring: {
                enabled: true,
                interval,
                priceAlert,
                stockAlert,
                priceThreshold,
                lastChecked: Date.now(),
                lastPrice: product.price,
                lastStock: product.stock || 'in_stock'
            },
            history: {
                price: [{
                    value: product.price,
                    timestamp: Date.now()
                }],
                stock: [{
                    status: product.stock || 'in_stock',
                    timestamp: Date.now()
                }]
            }
        };

        this.monitoringProducts.set(product.id, monitoringInfo);
        await this.saveMonitoringList();

        // 알람 등록
        await this.scheduleCheck(product.id, interval);

        console.log(`[MonitoringService] Started monitoring product #${product.id}`);
        return monitoringInfo;
    }

    /**
     * 모니터링 중지
     * @param {number} productId - 상품 ID
     */
    async stopMonitoring(productId) {
        const product = this.monitoringProducts.get(productId);
        if (!product) return;

        // 알람 취소
        await chrome.alarms.clear(`monitor_${productId}`);

        // 모니터링 목록에서 제거
        this.monitoringProducts.delete(productId);
        await this.saveMonitoringList();

        console.log(`[MonitoringService] Stopped monitoring product #${productId}`);
    }

    /**
     * 알람 스케줄링
     * @param {number} productId - 상품 ID
     * @param {number} interval - 간격 (분)
     */
    async scheduleCheck(productId, interval) {
        const alarmName = `monitor_${productId}`;

        // 기존 알람 취소
        await chrome.alarms.clear(alarmName);

        // 새 알람 등록
        await chrome.alarms.create(alarmName, {
            delayInMinutes: interval,
            periodInMinutes: interval
        });

        console.log(`[MonitoringService] Scheduled check for product #${productId} every ${interval} minutes`);
    }

    /**
     * 알람 리스너 설정
     */
    setupAlarmListener() {
        chrome.alarms.onAlarm.addListener(async (alarm) => {
            // 모니터링 알람인지 확인
            if (!alarm.name.startsWith('monitor_')) return;

            const productId = parseInt(alarm.name.replace('monitor_', ''));
            await this.checkProduct(productId);
        });
    }

    /**
     * 상품 확인 (가격/재고)
     * @param {number} productId - 상품 ID
     */
    async checkProduct(productId) {
        const product = this.monitoringProducts.get(productId);
        if (!product || !product.monitoring.enabled) return;

        console.log(`[MonitoringService] Checking product #${productId}...`);

        try {
            // URL로 페이지 열기 (백그라운드 탭)
            const tab = await chrome.tabs.create({
                url: product.url,
                active: false
            });

            // 컨텐츠 스크립트에 파싱 요청
            setTimeout(async () => {
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        action: 'parseProduct'
                    });

                    if (response && response.success) {
                        await this.handleProductUpdate(productId, response.product);
                    }
                } catch (error) {
                    console.error(`[MonitoringService] Parse error:`, error);
                } finally {
                    // 탭 닫기
                    chrome.tabs.remove(tab.id);
                }
            }, 3000); // 페이지 로딩 대기

        } catch (error) {
            console.error(`[MonitoringService] Check failed for product #${productId}:`, error);
        }

        // 마지막 체크 시간 업데이트
        product.monitoring.lastChecked = Date.now();
        await this.saveMonitoringList();
    }

    /**
     * 상품 업데이트 처리
     * @param {number} productId - 상품 ID
     * @param {Object} newData - 새 상품 데이터
     */
    async handleProductUpdate(productId, newData) {
        const product = this.monitoringProducts.get(productId);
        if (!product) return;

        const changes = {
            price: false,
            stock: false,
            priceChange: 0,
            stockChange: null
        };

        // 가격 변동 확인
        if (newData.price !== product.monitoring.lastPrice) {
            changes.price = true;
            changes.priceChange = newData.price - product.monitoring.lastPrice;

            // 히스토리 추가
            product.history.price.push({
                value: newData.price,
                timestamp: Date.now()
            });

            // 최근 100개만 유지
            if (product.history.price.length > 100) {
                product.history.price = product.history.price.slice(-100);
            }

            product.monitoring.lastPrice = newData.price;
        }

        // 재고 변동 확인
        const newStock = newData.stock || 'in_stock';
        if (newStock !== product.monitoring.lastStock) {
            changes.stock = true;
            changes.stockChange = {
                from: product.monitoring.lastStock,
                to: newStock
            };

            // 히스토리 추가
            product.history.stock.push({
                status: newStock,
                timestamp: Date.now()
            });

            if (product.history.stock.length > 100) {
                product.history.stock = product.history.stock.slice(-100);
            }

            product.monitoring.lastStock = newStock;
        }

        // 변동 사항 저장
        if (changes.price || changes.stock) {
            await this.saveMonitoringList();
            await this.sendNotification(product, changes);
        }

        console.log(`[MonitoringService] Product #${productId} updated:`, changes);
    }

    /**
     * 알림 전송
     * @param {Object} product - 상품
     * @param {Object} changes - 변동 내역
     */
    async sendNotification(product, changes) {
        let message = '';
        const options = product.monitoring;

        // 가격 변동 알림
        if (changes.price && options.priceAlert) {
            const percentChange = (changes.priceChange / (product.monitoring.lastPrice - changes.priceChange) * 100).toFixed(1);

            // 임계값 확인
            if (Math.abs(changes.priceChange) >= options.priceThreshold) {
                const direction = changes.priceChange > 0 ? '상승' : '하락';
                message += `가격 ${direction}: ${changes.priceChange > 0 ? '+' : ''}${changes.priceChange.toLocaleString()}원 (${percentChange}%)`;
            }
        }

        // 재고 변동 알림
        if (changes.stock && options.stockAlert) {
            if (message) message += '\n';

            const stockText = {
                'in_stock': '재고 있음',
                'out_of_stock': '품절',
                'low_stock': '재고 부족'
            };

            message += `재고 변동: ${stockText[changes.stockChange.from]} → ${stockText[changes.stockChange.to]}`;
        }

        if (!message) return;

        // Chrome 알림 생성
        await chrome.notifications.create(`monitor_${product.id}_${Date.now()}`, {
            type: 'basic',
            iconUrl: product.images?.[0] || chrome.runtime.getURL('assets/icons/icon128.png'),
            title: `🔔 ${product.name}`,
            message: message,
            priority: 2,
            requireInteraction: true,
            buttons: [
                { title: '상품 보기' },
                { title: '모니터링 중지' }
            ]
        });

        console.log(`[MonitoringService] Notification sent for product #${product.id}`);
    }

    /**
     * 모니터링 목록 저장
     */
    async saveMonitoringList() {
        const products = Array.from(this.monitoringProducts.values());
        await chrome.storage.local.set({ monitoringProducts: products });
    }

    /**
     * 모니터링 상품 목록 가져오기
     */
    getMonitoringProducts() {
        return Array.from(this.monitoringProducts.values());
    }

    /**
     * 특정 상품 모니터링 정보 가져오기
     * @param {number} productId - 상품 ID
     */
    getMonitoringInfo(productId) {
        return this.monitoringProducts.get(productId);
    }

    /**
     * 모니터링 옵션 업데이트
     * @param {number} productId - 상품 ID
     * @param {Object} options - 새 옵션
     */
    async updateMonitoringOptions(productId, options) {
        const product = this.monitoringProducts.get(productId);
        if (!product) return;

        Object.assign(product.monitoring, options);
        await this.saveMonitoringList();

        // 간격이 변경된 경우 알람 재설정
        if (options.interval) {
            await this.scheduleCheck(productId, options.interval);
        }

        console.log(`[MonitoringService] Updated monitoring options for product #${productId}`);
    }

    /**
     * 통계 가져오기
     */
    getStatistics() {
        const products = this.getMonitoringProducts();

        return {
            total: products.length,
            active: products.filter(p => p.monitoring.enabled).length,
            priceChanges: products.reduce((sum, p) => sum + (p.history.price.length - 1), 0),
            stockChanges: products.reduce((sum, p) => sum + (p.history.stock.length - 1), 0)
        };
    }
}

// 싱글톤 인스턴스
const monitoringService = new MonitoringService();

// ES6 Export
export { MonitoringService, monitoringService };
export default MonitoringService;
