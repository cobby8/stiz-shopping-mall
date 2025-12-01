// STIZ Product Knowledge Base
// This file contains the specific product data for the AI Chatbot.

const stizData = {
    basketball: [
        {
            name: "STIZ Pro Court Jersey",
            features: ["Cool-mesh fabric", "Moisture-wicking", "Reinforced stitching"],
            price_range: "₩45,000 - ₩60,000",
            recommended_for: "Professional leagues, Indoor courts",
            keywords: ["pro", "mesh", "indoor", "performance", "basketball"]
        },
        {
            name: "STIZ Street Baller Set",
            features: ["Durable heavy-weight mesh", "Loose fit", "Street style design"],
            price_range: "₩40,000 - ₩55,000",
            recommended_for: "Outdoor courts, 3x3 basketball, Street wear",
            keywords: ["street", "outdoor", "durable", "loose", "basketball"]
        }
    ],
    soccer: [
        {
            name: "STIZ Elite Striker Kit",
            features: ["Aero-dynamic fit", "Ultra-lightweight", "Laser-cut ventilation"],
            price_range: "₩50,000 - ₩70,000",
            recommended_for: "Competitive matches, Summer leagues",
            keywords: ["elite", "lightweight", "ventilation", "summer", "soccer"]
        },
        {
            name: "STIZ Team Classic",
            features: ["Standard fit", "High durability", "Classic collar design"],
            price_range: "₩35,000 - ₩50,000",
            recommended_for: "Amateur leagues, Training, School teams",
            keywords: ["classic", "durable", "training", "school", "soccer"]
        }
    ],
    teamwear: [
        {
            name: "STIZ Warm-up Tracksuit",
            features: ["Thermal insulation", "Zippered pockets", "Adjustable cuffs"],
            price_range: "₩80,000 - ₩100,000",
            recommended_for: "Pre-game warm-up, Winter training, Bench wear",
            keywords: ["warm-up", "winter", "tracksuit", "thermal"]
        },
        {
            name: "STIZ Coaching Staff Polo",
            features: ["Premium cotton blend", "Anti-wrinkle", "Embroidered logo"],
            price_range: "₩40,000 - ₩55,000",
            recommended_for: "Coaching staff, Official events",
            keywords: ["polo", "coach", "staff", "formal"]
        }
    ]
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = stizData;
}
