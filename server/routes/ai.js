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

export default router;
