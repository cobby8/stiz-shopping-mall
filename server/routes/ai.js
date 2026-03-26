import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

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
// POST /api/chat - AI 챗봇 대화 (Gemini 연동)
// 규칙 기반 응답에 매칭되지 않는 질문을 AI가 자연어로 답변
// ============================================================
router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        // 메시지 검증
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // API 키 없으면 안내 메시지로 폴백
        if (!process.env.GOOGLE_API_KEY) {
            return res.json({
                reply: '죄송합니다. 현재 AI 상담 서비스가 준비 중입니다. 카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.',
                source: 'fallback'
            });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // STIZ 쇼핑몰 컨텍스트를 시스템 프롬프트로 제공
        const systemPrompt = `당신은 STIZ(스티즈) 스포츠 유니폼 전문 쇼핑몰의 AI 상담사입니다.

회사 정보:
- STIZ는 축구, 농구, 배구, 야구 등 팀 유니폼 커스텀 제작 전문
- 최소 주문: 10벌부터 (20벌 이상 10% 할인, 50벌 이상 15% 할인)
- 커스텀 제작 기간: 2~3주
- 기성품 배송: 2~3 영업일 (5만원 이상 무료배송)
- Design Lab에서 2D/3D 디자인 가능 (custom.html)
- 반품/교환: 수령 후 7일 이내

상품 카테고리:
- 축구 유니폼 (홈/어웨이/GK): 45,000~55,000원
- 농구 저지: 39,000~49,000원
- 배구 유니폼: 42,000~48,000원
- 야구 유니폼: 55,000~65,000원
- 스포츠웨어(기성품): 25,000~89,000원
- KOGAS MD 상품: 15,000~45,000원

응답 규칙:
- 한국어로 친절하게 답변
- 2~3문장으로 간결하게
- 구체적 가격이나 기간을 포함
- 디자인 관련 질문은 Design Lab(custom.html) 안내
- 모르는 것은 "카카오톡 @stiz 또는 이메일 info@stiz.co.kr로 문의해주세요"로 안내`;

        // 시스템 프롬프트를 대화 히스토리의 첫 턴으로 주입
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: '네, STIZ AI 상담사로서 도움을 드리겠습니다.' }] }
            ]
        });

        const result = await chat.sendMessage(message);
        const reply = result.response.text();

        res.json({ reply, source: 'gemini' });
    } catch (error) {
        console.error('Chat API Error:', error.message);
        // 에러 시에도 사용자에게 친절한 안내 메시지 반환 (500이 아닌 200)
        res.json({
            reply: '일시적으로 AI 상담이 어렵습니다. 카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.',
            source: 'error'
        });
    }
});

export default router;
