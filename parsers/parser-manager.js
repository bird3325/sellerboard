/**
 * 파서 매니저
 * 플랫폼에 맞는 파서를 선택하고 관리
 */

class ParserManager {
    constructor() {
        this.parsers = new Map();
        this.initialized = false;
    }

    /**
     * 파서 초기화
     */
    async initialize() {
        if (this.initialized) return;

        // 한국 플랫폼 파서 등록
        this.registerParser('naver', () => new NaverParser());
        this.registerParser('coupang', () => new CoupangParser());
        this.registerParser('gmarket', () => new GmarketParser());
        this.registerParser('auction', () => new AuctionParser());
        this.registerParser('11st', () => new ElevenStParser());

        // 중국 플랫폼 파서 등록
        this.registerParser('aliexpress', () => new AliexpressParser());
        this.registerParser('1688', () => new China1688Parser());
        this.registerParser('taobao', () => new TaobaoParser());

        this.initialized = true;
        console.log('[ParserManager] Initialized with', this.parsers.size, 'parsers');
        console.log('[ParserManager] Supported platforms:', Array.from(this.parsers.keys()).join(', '));
    }

    /**
     * 파서 등록
     * @param {string} platform - 플랫폼 ID
     * @param {Function} factory - 파서 생성 팩토리 함수
     */
    registerParser(platform, factory) {
        this.parsers.set(platform, factory);
        console.log(`[ParserManager] Registered parser for ${platform}`);
    }

    /**
     * 플랫폼에 맞는 파서 가져오기
     * @param {string} platform - 플랫폼 ID
     * @returns {BaseParser} 파서 인스턴스
     */
    getParser(platform) {
        const factory = this.parsers.get(platform);

        if (!factory) {
            console.warn(`[ParserManager] No parser found for ${platform}, using base parser`);
            return new BaseParser(platform);
        }

        return factory();
    }

    /**
     * 현재 페이지에서 상품 정보 파싱
     * @returns {Promise<Object>} 파싱된 상품 정보
     */
    async parseCurrentPage() {
        await this.initialize();

        // 플랫폼 감지
        const platform = PlatformDetector.detect();
        console.log(`[ParserManager] Parsing product from ${platform}`);

        // 파서 가져오기
        const parser = this.getParser(platform);

        // 파싱 실행
        try {
            const product = await parser.parseProduct();
            return product;
        } catch (error) {
            console.error('[ParserManager] Parsing failed:', error);
            throw new Error(`상품 정보를 가져오는데 실패했습니다: ${error.message}`);
        }
    }

    /**
     * 지원되는 플랫폼 목록
     * @returns {Array<string>} 플랫폼 ID 목록
     */
    getSupportedPlatforms() {
        return Array.from(this.parsers.keys());
    }

    /**
     * 플랫폼 지원 여부 확인
     * @param {string} platform - 플랫폼 ID
     * @returns {boolean} 지원 여부
     */
    isPlatformSupported(platform) {
        return this.parsers.has(platform);
    }
}

// 싱글톤 인스턴스
const parserManager = new ParserManager();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParserManager;
    module.exports.parserManager = parserManager;
}
