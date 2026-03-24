import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../')); // Serve frontend files from root

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'MOCK_KEY');

// Debug: List Available Models
// Debug: List Available Models (Raw REST)
import axios from 'axios';

async function listAvailableModels() {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return;

    console.log(`\n🔍 Checking API Key: ${key.substring(0, 5)}...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const response = await axios.get(url);

        console.log("✅ API Connection Successful! Available Models:");
        const models = response.data.models || [];
        const names = models.map(m => m.name.replace('models/', ''));
        console.log(names.join(', '));

        // Suggestion based on list
        if (names.some(n => n.includes('gemini-2'))) {
            console.log("\n-> WOW: Newer 'gemini-2.x' models found! We should use those.");
        } else {
            console.warn("\nOK: Listing complete. Pick one from above.");
        }

    } catch (e) {
        console.error("❌ API Key Diagnostic Failed:");
        if (e.response) {
            console.error(`Status: ${e.response.status}`);
            console.error(`Reason: ${JSON.stringify(e.response.data.error, null, 2)}`);
        } else {
            console.error(e.message);
        }
    }
}
listAvailableModels();

// Routes
app.get('/', (req, res) => {
    res.send('STIZ AI Middleware Server is Running');
});

// Chatbot Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        console.log(`[Chat Request] "${message}"`);

        if (!process.env.GOOGLE_API_KEY) {
            return res.json({ success: true, reply: "AI Server is offline (No Key). But I heard you!" });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "You are STIZ AI Assistant. Helpful and cool. Keep answers short." }],
                },
                {
                    role: "model",
                    parts: [{ text: "Got it. I'm ready to help STIZ customers." }],
                },
            ],
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        console.log(`[Chat Reply] ${text}`);
        res.json({ success: true, reply: text });

    } catch (error) {
        console.error('CHAT ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Generation Endpoint
app.post('/api/generate', async (req, res) => {
    try {
        const { prompt, type } = req.body;
        console.log(`[Request] Type: ${type}, Prompt: ${prompt}`);

        if (!process.env.GOOGLE_API_KEY) {
            console.warn('⚠️ No API Key found. Returning Mock Data.');
            return res.json({
                success: true,
                mock: true,
                message: "This is a MOCK response because no API Key was provided.",
                imageUrl: getRandomMockImage(type),
                description: `Created a ${type} design based on: ${prompt}`
            });
        }

        // --- Real AI Logic (Gemini) ---
        // 1. Refine Prompt using Gemini (Text Logic)
        // Using "gemini-2.5-flash" as per 2025 Standard List
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Dynamic Prompting based on Request Type
        let refinementPrompt = '';

        if (type === 'logo') {
            // MODE 1: LOGO GENERATOR (FEW-SHOT LEARNING)
            console.log("--> 🎨 AI MODE: [LOGO CREATOR] (In-Context Learning Active)");
            refinementPrompt = `
                SYSTEM CONTEXT: You are an expert Vector Logo Designer. 
                Your ONLY job is to create simple, flat, vector-style emblems.
                You MUST IGNORE any request to make clothing, shirts, or jerseys.
                
                *** TRAINING EXAMPLES (FEW-SHOT LEARNING) ***
                
                Input: "Team STIZ, Turtle, Green"
                Output: "Logo Description: A flat vector shield emblem featuring a stylized green turtle character. Thick black outlines. Minimalist E-Sports style. White Background. --no t-shirt --no text"
                
                Input: "Red Dragons, 2024"
                Output: "Logo Description: A fierce red dragon head icon facing right. Circle background. Vector art style. Clean shapes. White Background. --no uniform --no body"
                
                Input: "Blue Waves, Typography"
                Output: "Logo Description: A bold typography mark for 'WAVES'. Blue gradient letters with white outline. Sticker style. White Background."
                
                *** END EXAMPLES ***
                
                Current User Request: "${prompt}"
                
                STRICT RULES:
                1. Output format MUST be "Logo Description: [Visual Description]".
                2. Do NOT mention "Jersey", "Shirt", "Fabric", "Sleeve", "Mannequin".
                3. If the user asks for a "Kit" or "Uniform", IGNORE IT and make a LOGO based on that theme instead.
                4. Background must be "Solid White".
            `;
        } else {
            // MODE 2: UNIFORM DESIGNER (CLOTHING)
            console.log("--> 👕 AI MODE: [FASHION DESIGNER] (Creating Mockups)");
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

        console.log(`[AI Refined] ${refinedPrompt} `);

        // 2. Generate Image (Simulated for now, usually calls Imagen/SDXL API)
        // ideally: const imageRes = await axios.post(IMAGEN_URL, { prompt: refinedPrompt });
        // For Phase 1 foundation, we will still simulate the IMAGE step but verify LOGIC step.

        // 2. Generate Image (Real)
        console.log(`[Image Gen] Requesting Imagen 4.0 for: "${refinedPrompt}" ...`);
        let generatedImageUrl = getRandomMockImage(type); // Default fallback

        try {
            // Attempt to call Imagen Standard/Fast via Generative Language API (REST)
            // Updated to use the confirmed available model: imagen-4.0-fast-generate-001
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${process.env.GOOGLE_API_KEY}`;


            // Imagen request body structure (standard)
            const imagenBody = {
                instances: [
                    { prompt: refinedPrompt }
                ],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1"
                }
            };

            const imgResponse = await axios.post(imagenUrl, imagenBody);

            // Parsing response (Vertex/Imagen style)
            if (imgResponse.data.predictions && imgResponse.data.predictions[0]) {
                const base64Image = imgResponse.data.predictions[0].bytesBase64Encoded;
                generatedImageUrl = `data:image/png;base64,${base64Image}`;
                console.log("[Image Gen] Success! (Base64 received)");
            } else {
                console.warn("[Image Gen] API returned success but no image (unexpected format). Using mock.");
                console.log("Response:", JSON.stringify(imgResponse.data).substring(0, 200));
            }

        } catch (imgError) {
            console.error(`[Image Gen] Failed (Status: ${imgError.response?.status})`);
            console.error(`Reason: ${JSON.stringify(imgError.response?.data?.error || imgError.message)}`);
            // Fallback to Mock is already set
        }


        res.json({
            success: true,
            prompt_refined: refinedPrompt,
            imageUrl: generatedImageUrl, // Returning Real Image or Fallback Mock
            credits_remaining: 2 // Mock
        });

    } catch (error) {
        console.error('SERVER ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper for Mock Images
function getRandomMockImage(type) {
    const mocks = [
        'https://via.placeholder.com/600x600/111/fff?text=AI+Design+Variant+1',
        'https://via.placeholder.com/600x600/e63946/fff?text=AI+Design+Variant+2',
        'https://via.placeholder.com/600x600/333/fff?text=AI+Design+Variant+3'
    ];
    return mocks[Math.floor(Math.random() * mocks.length)];
}

// Start Server
app.listen(port, () => {
    console.log(`\n🚀 STIZ AI Server running at http://localhost:${port}`);
    console.log(`   - Endpoint: http://localhost:${port}/api/generate`);
    console.log(`   - Status: ${process.env.GOOGLE_API_KEY ? 'Online (Key Found)' : 'Offline (No Key)'}\n`);
});
