/**
 * STIZ Product Mock Data
 * Used for development preview without backend
 */

const products = [
    {
        id: 1,
        name: "STIZ Pro Basketball Jersey - Home",
        price: 49000,
        category: "basketball",
        type: "custom",
        image: "https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=1790&auto=format&fit=crop",
        description: "Professional grade basketball jersey with moisture-wicking fabric."
    },
    {
        id: 2,
        name: "STIZ Elite Soccer Kit - Blue",
        price: 55000,
        category: "soccer",
        type: "custom",
        image: "https://images.unsplash.com/photo-1512719994953-eabf5089288f?q=80&w=1740&auto=format&fit=crop",
        description: "Lightweight soccer kit designed for maximum agility."
    },
    {
        id: 3,
        name: "KOGAS Official Home Jersey",
        price: 89000,
        category: "kogas",
        type: "store",
        image: "https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=1587&auto=format&fit=crop",
        description: "Official 24/25 Season Home Jersey of KOGAS Pegasus."
    },
    {
        id: 4,
        name: "Training Warmup Set",
        price: 120000,
        category: "teamwear",
        type: "custom",
        image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=1586&auto=format&fit=crop",
        description: "Complete warmup set for pre-game and training sessions."
    },
    {
        id: 5,
        name: "Molten BG4500 Basketball",
        price: 75000,
        category: "accessories",
        type: "store",
        image: "https://images.unsplash.com/photo-1519861531473-92002639314e?q=80&w=1760&auto=format&fit=crop",
        description: "FIBA approved official game ball."
    },
    {
        id: 6,
        name: "Premium Compression Tights",
        price: 42000,
        category: "sportswear",
        type: "store",
        image: "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?q=80&w=1776&auto=format&fit=crop",
        description: "High-performance compression tights for recovery."
    },
    {
        id: 7,
        name: "STIZ Custom Volleyball Jersey",
        price: 45000,
        category: "volleyball",
        type: "custom",
        image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=1607&auto=format&fit=crop",
        description: "Customizable volleyball jersey with breathable mesh."
    },
    {
        id: 8,
        name: "Team Equipment Bag",
        price: 65000,
        category: "accessories",
        type: "store",
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=1587&auto=format&fit=crop",
        description: "Large capacity bag for team equipment."
    },
    {
        id: 9,
        name: "STIZ Custom Baseball Uniform",
        price: 62000,
        category: "baseball",
        type: "custom",
        image: "https://images.unsplash.com/photo-1593034509785-5b17ba49f683?q=80&w=1587&auto=format&fit=crop",
        description: "Classic pinstripe baseball uniform with custom embroidery."
    }
];

// Helper to get product by ID
function getProductById(id) {
    return products.find(p => p.id === parseInt(id));
}

// Helper to filter products
// Updated to support filtering by category AND type
function getProductsByCategory(category, type = null) {
    let filtered = products;

    // Filter by Category
    if (category && category !== 'all') {
        filtered = filtered.filter(p => p.category === category);
    }

    // Filter by Type (custom vs store)
    if (type) {
        filtered = filtered.filter(p => p.type === type);
    }

    return filtered;
}

/**
 * Sizing Standards (Mock Database)
 * Used by size_recommender.js
 */
const SIZING_CHARTS = {
    top: {
        // Height (cm) based standard
        // This is a simplified logic. Real logic would use Weight + Chest.
        ranges: [
            { height_min: 0, height_max: 165, weight_max: 60, size: "S (90)" },
            { height_min: 160, height_max: 172, weight_max: 70, size: "M (95)" },
            { height_min: 170, height_max: 178, weight_max: 78, size: "L (100)" },
            { height_min: 175, height_max: 184, weight_max: 85, size: "XL (105)" },
            { height_min: 180, height_max: 190, weight_max: 95, size: "2XL (110)" },
            { height_min: 185, height_max: 200, weight_max: 110, size: "3XL (115)" }
        ]
    }
};

/**
 * Option Pricing (Mock Database)
 * Used by quote_wizard.js
 */
const PRICING_OPTIONS = {
    base_uniform: 39000, // Standard Set Base Price
    add_ons: [
        { id: 'team_mark', name: '팀명/번호 마킹 (Team Mark)', price: 5000 },
        { id: 'emblem', name: '엠블럼 부착 (Emblem Patch)', price: 3000 },
        { id: 'socks', name: '스타킹 추가 (Socks)', price: 6000 },
        { id: 'long_sleeve', name: '긴팔 변경 (Long Sleeve)', price: 4000 }
    ],
    discounts: [
        { min_qty: 10, rate: 0.05, label: '5% (10벌 이상)' },
        { min_qty: 20, rate: 0.10, label: '10% (20벌 이상)' },
        { min_qty: 50, rate: 0.15, label: '15% (50벌 이상)' }
    ]
};
