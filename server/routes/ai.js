import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { database as db } from '../db-sqlite.js';

const router = express.Router();

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'MOCK_KEY');

// Helper for Mock Images
function getRandomMockImage(type) {
    const mocks = [
        'https://via.placeholder.com/600x600/111/fff?text=AI+Design+Variant+1',
        'https://via.placeholder.com/600x600/e63946/fff?text=AI+Design+Variant+2',
        'https://via.placeholder.com/600x600/333/fff?text=AI+Design+Variant+3'
    ];
    return mocks[Math.floor(Math.random() * mocks.length)];
}

// POST /api/generate - AI Design Generation
router.post('/', async (req, res) => {
    try {
        const { prompt, type } = req.body;
        console.log(`[Request] Type: ${type}, Prompt: ${prompt}`);

        if (!process.env.GOOGLE_API_KEY) {
            console.warn('No API Key found. Returning Mock Data.');
            return res.json({
                success: true,
                mock: true,
                message: "This is a MOCK response because no API Key was provided.",
                imageUrl: getRandomMockImage(type),
                description: `Created a ${type} design based on: ${prompt}`
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let refinementPrompt = '';

        if (type === 'logo') {
            console.log("--> AI MODE: [LOGO CREATOR]");
            refinementPrompt = `
                SYSTEM CONTEXT: You are an expert Vector Logo Designer.
                Your ONLY job is to create simple, flat, vector-style emblems.
                You MUST IGNORE any request to make clothing, shirts, or jerseys.

                *** TRAINING EXAMPLES ***
                Input: "Team STIZ, Turtle, Green"
                Output: "Logo Description: A flat vector shield emblem featuring a stylized green turtle character. Thick black outlines. Minimalist E-Sports style. White Background. --no t-shirt --no text"

                Input: "Red Dragons, 2024"
                Output: "Logo Description: A fierce red dragon head icon facing right. Circle background. Vector art style. Clean shapes. White Background. --no uniform --no body"
                *** END EXAMPLES ***

                Current User Request: "${prompt}"

                STRICT RULES:
                1. Output format MUST be "Logo Description: [Visual Description]".
                2. Do NOT mention "Jersey", "Shirt", "Fabric", "Sleeve", "Mannequin".
                3. Background must be "Solid White".
            `;
        } else if (type === 'mockup') {
            // 목업 뷰어에서 호출: 유니폼 착용 사진 스타일 이미지 생성
            console.log("--> AI MODE: [MOCKUP GENERATOR]");
            refinementPrompt = `
                Role: Professional Sports Photography Director.
                Task: Create a studio-quality product mockup photo based on: "${prompt}".

                STRICT CONSTRAINTS:
                1. **Subject**: Athletic model wearing the described sportswear uniform.
                2. **Pose**: Standing confidently, front-facing, professional sports portrait.
                3. **Background**: Clean studio white or light gray gradient.
                4. **Lighting**: Professional studio lighting, soft shadows.
                5. **Quality**: High-resolution product photography style.

                Output Format: "Mockup Description: [detailed visual description for image generation]"
            `;
        } else {
            console.log("--> AI MODE: [FASHION DESIGNER]");
            refinementPrompt = `
                Role: 3D Fashion Designer.
                Task: Create a highly detailed SPORTSWEAR MOCKUP based on: "${prompt}".

                STRICT CONSTRAINTS:
                1. **Subject**: Ghost Mannequin or 3D Flat Lay.
                2. **Content**: Full Jersey and Shorts visible.
                3. **Background**: Clean Studio White.

                Output Format: "Design Description: [Subject: Sportswear Uniform] [Details: colors, patterns] [Style: Ghost mannequin, white background]"
            `;
        }

        const result = await model.generateContent(refinementPrompt);
        const response = await result.response;
        const refinedPrompt = response.text()
            .replace('Design Description:', '')
            .replace('Logo Description:', '')
            .replace('Mockup Description:', '')  // 목업 타입 접두사 제거
            .trim();

        console.log(`[AI Refined] ${refinedPrompt}`);

        let generatedImageUrl = getRandomMockImage(type);

        try {
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${process.env.GOOGLE_API_KEY}`;
            const imagenBody = {
                instances: [{ prompt: refinedPrompt }],
                parameters: { sampleCount: 1, aspectRatio: "1:1" }
            };

            const imgResponse = await axios.post(imagenUrl, imagenBody);

            if (imgResponse.data.predictions && imgResponse.data.predictions[0]) {
                const base64Image = imgResponse.data.predictions[0].bytesBase64Encoded;
                generatedImageUrl = `data:image/png;base64,${base64Image}`;
                console.log("[Image Gen] Success!");
            }
        } catch (imgError) {
            console.error(`[Image Gen] Failed: ${imgError.response?.status || imgError.message}`);
        }

        res.json({
            success: true,
            prompt_refined: refinedPrompt,
            imageUrl: generatedImageUrl,
            credits_remaining: 2
        });

    } catch (error) {
        console.error('SERVER ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// POST /api/chat - 챗봇 "티즈" 대화 (Gemini 연동)
// 클라이언트의 규칙 기반 1차 분류를 통과한 질문만 여기 도달합니다.
// 요청 body:
//   - message: 사용자 현재 메시지
//   - history: 최근 4턴 전후(최대 8개) [{role:'user'|'model', text}]
//   - context: (선택) 추가 컨텍스트
// 응답 body: { reply, source }
// ============================================================

// 상품 문의로 보이는 키워드 — 감지되면 DB에서 관련 상품 3개를 프롬프트에 주입
// 비유: 손님이 "농구 유니폼" 얘기 꺼내면 티즈가 실제 매장 선반 확인하고 답하는 것
const PRODUCT_KEYWORDS = /(상품|제품|유니폼|저지|jersey|uniform|바지|반팔|반바지|농구|축구|배구|야구|basketball|soccer|volleyball|baseball|추천|인기|신상|가격|얼마|싼|저렴|비싼)/i;

// DB에서 관련 상품 상위 N개를 간단 요약 문자열로 반환 (없으면 빈 문자열)
function buildProductContext(message, limit = 3) {
    try {
        const term = `%${message}%`;
        // 이름/영문명/키워드/설명에 조금이라도 매칭되는 active 상품 우선 조회
        let rows = db.prepare(`
            SELECT p.id, p.name, p.price, c.name AS categoryName
            FROM products p
            LEFT JOIN product_categories c ON p.categoryId = c.id
            WHERE p.status = 'active'
              AND (p.name LIKE ? OR p.nameEn LIKE ? OR p.keywords LIKE ? OR p.description LIKE ?)
            ORDER BY p.sortOrder ASC, p.createdAt DESC
            LIMIT ?
        `).all(term, term, term, term, limit);

        // 키워드 매칭 결과가 없으면 sortOrder 기반 대표 상품으로 폴백
        if (!rows || rows.length === 0) {
            rows = db.prepare(`
                SELECT p.id, p.name, p.price, c.name AS categoryName
                FROM products p
                LEFT JOIN product_categories c ON p.categoryId = c.id
                WHERE p.status = 'active' AND p.sortOrder > 0
                ORDER BY p.sortOrder ASC
                LIMIT ?
            `).all(limit);
        }

        if (!rows || rows.length === 0) return '';

        const lines = rows.map(r => {
            const priceStr = typeof r.price === 'number' ? `${r.price.toLocaleString()}원` : '가격문의';
            return `- [${r.categoryName || '기타'}] ${r.name} / ${priceStr} (상품ID: ${r.id})`;
        }).join('\n');
        return `\n\n현재 판매중인 관련 상품(참고용):\n${lines}`;
    } catch (e) {
        console.error('[chat] product context 조회 실패:', e.message);
        return '';
    }
}

// 클라이언트 history 배열을 Gemini startChat 포맷으로 변환
// role은 'user' | 'model' 만 허용
function toGeminiHistory(history) {
    if (!Array.isArray(history)) return [];
    // 최대 4턴(= 8개 메시지) 제한: 토큰 낭비 방지
    const sliced = history.slice(-8);
    return sliced
        .filter(h => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'model'))
        .map(h => ({ role: h.role, parts: [{ text: h.text }] }));
}

router.post('/chat', async (req, res) => {
    try {
        const { message, history, context } = req.body;

        // 메시지 검증
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // API 키 없으면 안내 메시지로 폴백
        if (!process.env.GOOGLE_API_KEY) {
            return res.json({
                reply: '지금은 AI 상담이 준비 중이에요. 카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.',
                source: 'fallback'
            });
        }

        // 1) 상품 관련 질문이면 DB에서 실시간 상품 컨텍스트 주입
        let productContext = '';
        if (PRODUCT_KEYWORDS.test(message)) {
            productContext = buildProductContext(message, 3);
        }

        // 2) 시스템 프롬프트 — "티즈" 페르소나
        const systemPrompt = `당신은 STIZ(스티즈) 스포츠 유니폼 전문 쇼핑몰의 상담봇 "티즈"입니다.
이름은 "티즈"이고, 친근하지만 전문적인 매장 직원처럼 답변합니다.

회사 정보:
- STIZ는 축구, 농구, 배구, 야구 등 팀 유니폼 커스텀 제작 전문
- 최소 주문: 10벌부터 (10벌 5% / 20벌 10% / 50벌 15% 할인)
- 커스텀 제작 기간: 2~3주
- 기성품 배송: 2~3 영업일 (5만원 이상 무료배송, 미만 3,000원)
- Design Lab에서 2D/3D 디자인 가능 (custom.html)
- 반품/교환: 수령 후 7일 이내, 커스텀은 반품 불가

응답 규칙:
- 한국어로 2~3문장 이내 간결하게
- 자신을 "티즈"라고 소개할 수 있지만 매번 반복하지 않음
- 확신 없는 상품/가격은 지어내지 말고 "상담원에게 연결해드릴까요?"로 유도
- 디자인/커스텀 질문은 custom.html 안내
- 주문 조회는 order-track.html(비회원) 또는 myshop.html(회원) 안내
- 모르는 것은 "카카오톡 @stiz 또는 이메일 info@stiz.co.kr로 문의해주세요"로 안내${productContext}${context ? `\n\n추가 컨텍스트: ${context}` : ''}`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // 3) 대화 히스토리 구성 — 시스템 프롬프트를 첫 턴으로 주입 + 클라이언트 history 이어붙이기
        const clientHistory = toGeminiHistory(history);
        const startHistory = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: '네, 티즈가 도와드릴게요!' }] },
            ...clientHistory
        ];

        // 주의: history의 마지막 메시지는 지금 보낼 message와 동일할 수 있으므로 제거
        // (클라이언트가 방금 user 턴을 push한 후 호출하기 때문)
        if (startHistory.length > 2) {
            const last = startHistory[startHistory.length - 1];
            if (last.role === 'user' && last.parts?.[0]?.text === message) {
                startHistory.pop();
            }
        }

        const chat = model.startChat({ history: startHistory });
        const result = await chat.sendMessage(message);
        const reply = result.response.text();

        res.json({ reply, source: 'gemini' });
    } catch (error) {
        console.error('Chat API Error:', error.message);
        // 에러 시에도 사용자에게 친절한 안내 메시지 반환 (500 대신 200)
        res.json({
            reply: '지금은 답변을 준비하지 못했어요. 카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.',
            source: 'error'
        });
    }
});

export default router;
