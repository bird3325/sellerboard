/**
 * Gemini AI 서비스
 * Google Gemini API를 사용한 상품 상세페이지 생성 및 SEO 최적화
 */

class GeminiService {
    constructor() {
        this.apiKey = null;
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        this.initialized = false;
    }

    /**
     * API 키 설정
     * @param {string} key - Gemini API 키
     */
    async setApiKey(key) {
        this.apiKey = key;
        this.initialized = true;

        // storage에 저장
        await chrome.storage.sync.set({ geminiApiKey: key });
        console.log('[GeminiService] API 키 설정 완료');
    }

    /**
     * 저장된 API 키 불러오기
     */
    async loadApiKey() {
        const result = await chrome.storage.sync.get('geminiApiKey');
        if (result.geminiApiKey) {
            this.apiKey = result.geminiApiKey;
            this.initialized = true;
            console.log('[GeminiService] API 키 불러오기 완료');
            return true;
        }
        return false;
    }

    /**
     * Gemini API 호출
     * @param {string} prompt - 프롬프트
     * @returns {Promise<string>} 생성된 텍스트
     */
    async callGemini(prompt) {
        if (!this.initialized || !this.apiKey) {
            throw new Error('Gemini API 키가 설정되지 않았습니다');
        }

        try {
            const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Gemini API 오류: ${error.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error('Gemini API 응답이 비어있습니다');
            }

            return text;
        } catch (error) {
            console.error('[GeminiService] API 호출 실패:', error);
            throw error;
        }
    }

    /**
     * 상품 상세페이지 생성
     * @param {Object} product - 상품 정보
     * @param {Object} options - 생성 옵션 {tone, length, platform}
     * @returns {Promise<Object>} 생성 결과
     */
    async generateProductDescription(product, options = {}) {
        const { tone = 'friendly', length = 'medium', platform = 'general' } = options;

        const toneMap = {
            formal: '전문적이고 공식적인',
            friendly: '친근하고 대화하는 듯한',
            humorous: '유머러스하고 재미있는'
        };

        const lengthMap = {
            short: '2-3문장으로 간단히',
            medium: '5-7문장으로 적당히',
            long: '10문장 이상 상세하게'
        };

        const platformTips = {
            naver: '네이버 스마트스토어 특성에 맞게 친근하고 상세하게',
            coupang: '쿠팡 고객들을 위해 빠른 배송과 신뢰성 강조하며',
            gmarket: 'G마켓 특성상 가성비와 다양한 혜택을 강조하며',
            aliexpress: '해외 직구 고객을 위해 품질과 배송 정보를 명확히',
            general: '일반적인 온라인 쇼핑몰 스타일로'
        };

        const prompt = `
당신은 ${platform} 플랫폼의 전문 상품 페이지 작성자입니다.
다음 상품에 대해 ${toneMap[tone]} 톤으로 ${lengthMap[length]} 상세페이지를 작성해주세요.

상품 정보:
- 상품명: ${product.name}
- 가격: ${product.price}원
- 플랫폼: ${product.platform}
${product.options?.length > 0 ? `- 옵션: ${product.options.map(opt => opt.name).join(', ')}` : ''}
${product.specs ? `- 사양: ${JSON.stringify(product.specs, null, 2)}` : ''}
${product.description?.text ? `- 기존 설명: ${product.description.text.substring(0, 200)}...` : ''}

요구사항:
1. ${platformTips[platform] || platformTips.general}
2. SEO 최적화된 키워드를 자연스럽게 포함
3. 구매 전환율을 높이는 설득력 있는 문구
4. 읽기 쉬운 구조 (문단 나누기, 번호 목록 활용)
5. ${product.name}에서 핵심 키워드 추출하여 반복 사용

생성 규칙:
- 과장된 표현 지양
- 구체적인 정보 위주
- 고객 혜택 중심으로 작성
- HTML 태그 없이 순수 텍스트로만 작성
`;

        console.log('[GeminiService] 상세페이지 생성 시작...');
        const description = await this.callGemini(prompt);

        // SEO 분석 및 키워드 추출 병렬 실행
        const [seoScore, keywords] = await Promise.all([
            this.analyzeSEO(description, platform),
            this.extractKeywords(description)
        ]);

        return {
            description,
            seoScore,
            keywords,
            metadata: {
                tone,
                length,
                platform,
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * 상품명 최적화
     * @param {string} name - 현재 상품명
     * @param {string} platform - 플랫폼
     * @param {Array} targetKeywords - 타겟 키워드
     * @returns {Promise<Array>} 최적화된 상품명 옵션들
     */
    async optimizeProductName(name, platform = 'general', targetKeywords = []) {
        const prompt = `
${platform} 플랫폼에 최적화된 상품명을 만들어주세요.

현재 상품명: ${name}
타겟 키워드: ${targetKeywords.join(', ') || '없음'}

요구사항:
1. ${platform} 검색 알고리즘에 최적화
2. 클릭율을 높이는 매력적인 문구
3. 주요 키워드를 자연스럽게 포함
4. 플랫폼별 글자수 제한 준수 (네이버: 100자, 쿠팡: 120자)
5. 3가지 옵션 제시

출력 형식 (다른 텍스트 없이 정확히 이 형식만):
옵션1: [상품명]
옵션2: [상품명]
옵션3: [상품명]
`;

        const result = await this.callGemini(prompt);

        // 옵션 파싱
        const options = result.split('\n')
            .filter(line => line.trim().startsWith('옵션'))
            .map(line => {
                const colonIndex = line.indexOf(':');
                return colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : null;
            })
            .filter(Boolean);

        return options.length > 0 ? options : [name];
    }

    /**
     * SEO 분석
     * @param {string} content - 분석할 콘텐츠
     * @param {string} platform - 플랫폼
     * @returns {Promise<Object>} SEO 분석 결과
     */
    async analyzeSEO(content, platform = 'general') {
        const prompt = `
다음 상품 설명의 SEO 점수를 분석하고 개선점을 제시해주세요.
플랫폼: ${platform}

내용:
${content}

다음 항목을 JSON 형식으로 정확히 분석 (다른 텍스트 없이 JSON만):
{
  "score": 0-100 사이의 숫자,
  "keywordDensity": "적절함" 또는 "부족함" 또는 "과다함",
  "readability": "쉬움" 또는 "보통" 또는 "어려움",
  "structure": "우수" 또는 "양호" 또는 "개선필요",
  "improvements": ["개선점1", "개선점2", "개선점3"]
}
`;

        try {
            const result = await this.callGemini(prompt);

            // JSON 파싱 (마크다운 코드 블록 제거)
            const jsonText = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const analysis = JSON.parse(jsonText);

            return {
                score: analysis.score || 50,
                keywordDensity: analysis.keywordDensity || '보통',
                readability: analysis.readability || '보통',
                structure: analysis.structure || '양호',
                improvements: analysis.improvements || []
            };
        } catch (error) {
            console.error('[GeminiService] SEO 분석 파싱 실패:', error);
            return {
                score: 50,
                keywordDensity: '보통',
                readability: '보통',
                structure: '양호',
                improvements: ['분석 중 오류 발생']
            };
        }
    }

    /**
     * 키워드 추출
     * @param {string} text - 텍스트
     * @returns {Promise<Array>} 키워드 배열
     */
    async extractKeywords(text) {
        const prompt = `
다음 텍스트에서 핵심 키워드 10개를 추출하고 중요도 순으로 정렬해주세요:

${text}

JSON 배열로만 반환 (다른 텍스트 없이):
["키워드1", "키워드2", "키워드3", ...]
`;

        try {
            const result = await this.callGemini(prompt);
            const jsonText = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const keywords = JSON.parse(jsonText);
            return Array.isArray(keywords) ? keywords.slice(0, 10) : [];
        } catch (error) {
            console.error('[GeminiService] 키워드 추출 실패:', error);
            return [];
        }
    }

    /**
     * 표절 검증 (간이 버전)
     * @param {string} content - 검증할 콘텐츠
     * @returns {Promise<Object>} 표절 검증 결과
     */
    async detectPlagiarism(content) {
        const prompt = `
다음 텍스트가 일반적인 템플릿이나 과도하게 사용되는 진부한 문구를 포함하고 있는지 분석해주세요:

${content}

JSON 형식으로만 응답 (다른 텍스트 없이):
{
  "isPlagiarized": true 또는 false,
  "confidence": 0-100,
  "suspiciousPhrases": ["의심 문구1", "의심 문구2"],
  "recommendation": "권장사항"
}
`;

        try {
            const result = await this.callGemini(prompt);
            const jsonText = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(jsonText);
        } catch (error) {
            console.error('[GeminiService] 표절 검증 실패:', error);
            return {
                isPlagiarized: false,
                confidence: 0,
                suspiciousPhrases: [],
                recommendation: '검증 중 오류 발생'
            };
        }
    }
}

// 싱글톤 인스턴스
const geminiService = new GeminiService();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeminiService;
    module.exports.geminiService = geminiService;
}
