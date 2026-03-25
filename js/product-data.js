/**
 * STIZ Product Mock Data
 * Used for development preview without backend
 */

const products = [
    // ===== BASKETBALL (Custom) =====
    {
        id: 1,
        name: "STIZ Pro Basketball Jersey - Home",
        price: 49000,
        category: "basketball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["White", "Black", "Red"],
        stock: 100,
        images: [
            "https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=400&auto=format&fit=crop",
        description: "Professional grade basketball jersey with moisture-wicking fabric.",
        isNew: false,
        isBest: true
    },
    {
        id: 10,
        name: "STIZ Pro Basketball Jersey - Away",
        price: 49000,
        category: "basketball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Navy", "Gray", "Blue"],
        stock: 80,
        images: [
            "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?q=80&w=400&auto=format&fit=crop",
        description: "Away edition basketball jersey with lightweight mesh panels.",
        isNew: true,
        isBest: false
    },
    {
        id: 11,
        name: "Basketball Shorts - Pro Cut",
        price: 35000,
        category: "basketball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Black", "White", "Navy"],
        stock: 120,
        images: [
            "https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=400&auto=format&fit=crop",
        description: "Pro-cut basketball shorts with side pockets and elastic waistband.",
        isNew: false,
        isBest: false
    },
    {
        id: 12,
        name: "STIZ Reversible Basketball Jersey",
        price: 59000,
        category: "basketball",
        type: "custom",
        sizes: ["M", "L", "XL", "2XL"],
        colors: ["Black/White", "Navy/Gold", "Red/White"],
        stock: 60,
        images: [
            "https://images.unsplash.com/photo-1519861531473-92002639314e?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1519861531473-92002639314e?q=80&w=400&auto=format&fit=crop",
        description: "Two-in-one reversible jersey for practice and game day.",
        isNew: true,
        isBest: true
    },
    {
        id: 13,
        name: "Basketball Shooting Shirt",
        price: 38000,
        category: "basketball",
        type: "custom",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "White", "Gray"],
        stock: 90,
        images: [
            "https://images.unsplash.com/photo-1577471488278-16eec37ffcc2?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1577471488278-16eec37ffcc2?q=80&w=400&auto=format&fit=crop",
        description: "Lightweight shooting shirt for warmup sessions.",
        isNew: false,
        isBest: false
    },

    // ===== SOCCER (Custom) =====
    {
        id: 2,
        name: "STIZ Elite Soccer Kit - Blue",
        price: 55000,
        category: "soccer",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Blue", "Red", "White"],
        stock: 150,
        images: [
            "https://images.unsplash.com/photo-1512719994953-eabf5089288f?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1512719994953-eabf5089288f?q=80&w=400&auto=format&fit=crop",
        description: "Lightweight soccer kit designed for maximum agility.",
        isNew: false,
        isBest: true
    },
    {
        id: 14,
        name: "STIZ Soccer Jersey - Stripe Edition",
        price: 52000,
        category: "soccer",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Red/White", "Blue/White", "Black/Gold"],
        stock: 100,
        images: [
            "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=400&auto=format&fit=crop",
        description: "Classic striped soccer jersey with sublimation printing.",
        isNew: true,
        isBest: false
    },
    {
        id: 15,
        name: "Soccer Shorts - Match Day",
        price: 32000,
        category: "soccer",
        type: "custom",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "White", "Navy"],
        stock: 200,
        images: [
            "https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=400&auto=format&fit=crop",
        description: "Breathable match-day shorts with inner lining.",
        isNew: false,
        isBest: false
    },
    {
        id: 16,
        name: "Goalkeeper Jersey - Pro",
        price: 65000,
        category: "soccer",
        type: "custom",
        sizes: ["M", "L", "XL", "2XL"],
        colors: ["Neon Yellow", "Orange", "Black"],
        stock: 40,
        images: [
            "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=400&auto=format&fit=crop",
        description: "Padded goalkeeper jersey with grip technology.",
        isNew: false,
        isBest: false
    },
    {
        id: 17,
        name: "Soccer Socks - Team Pack (5 pairs)",
        price: 25000,
        category: "soccer",
        type: "custom",
        sizes: ["S", "M", "L"],
        colors: ["White", "Black", "Navy", "Red"],
        stock: 300,
        images: [
            "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=400&auto=format&fit=crop",
        description: "Compression soccer socks with arch support. Team pack of 5 pairs.",
        isNew: false,
        isBest: false
    },

    // ===== VOLLEYBALL (Custom) =====
    {
        id: 7,
        name: "STIZ Custom Volleyball Jersey",
        price: 45000,
        category: "volleyball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["White", "Blue", "Red"],
        stock: 80,
        images: [
            "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=400&auto=format&fit=crop",
        description: "Customizable volleyball jersey with breathable mesh.",
        isNew: false,
        isBest: true
    },
    {
        id: 18,
        name: "Volleyball Shorts - Libero",
        price: 30000,
        category: "volleyball",
        type: "custom",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "Navy", "White"],
        stock: 100,
        images: [
            "https://images.unsplash.com/photo-1547347298-4074fc3086f0?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1547347298-4074fc3086f0?q=80&w=400&auto=format&fit=crop",
        description: "Lightweight volleyball shorts with stretch fabric.",
        isNew: false,
        isBest: false
    },
    {
        id: 19,
        name: "Volleyball Jersey - Sublimation Print",
        price: 52000,
        category: "volleyball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Custom"],
        stock: 50,
        images: [
            "https://images.unsplash.com/photo-1592656094267-764a45160876?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1592656094267-764a45160876?q=80&w=400&auto=format&fit=crop",
        description: "Full sublimation volleyball jersey. Unlimited design options.",
        isNew: true,
        isBest: false
    },

    // ===== TEAMWEAR (Custom) =====
    {
        id: 4,
        name: "Training Warmup Set",
        price: 120000,
        category: "teamwear",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Black", "Navy", "Gray"],
        stock: 50,
        images: [
            "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=400&auto=format&fit=crop",
        description: "Complete warmup set for pre-game and training sessions.",
        isNew: false,
        isBest: true
    },
    {
        id: 20,
        name: "Team Windbreaker Jacket",
        price: 85000,
        category: "teamwear",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Black", "Navy", "Charcoal"],
        stock: 70,
        images: [
            "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=400&auto=format&fit=crop",
        description: "Water-resistant team windbreaker with custom embroidery.",
        isNew: true,
        isBest: false
    },
    {
        id: 21,
        name: "Training Pants - Slim Fit",
        price: 55000,
        category: "teamwear",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Black", "Navy"],
        stock: 90,
        images: [
            "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?q=80&w=400&auto=format&fit=crop",
        description: "Slim-fit training pants with zippered ankles.",
        isNew: false,
        isBest: false
    },
    {
        id: 22,
        name: "Team Hoodie - Fleece",
        price: 72000,
        category: "teamwear",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
        colors: ["Black", "Gray", "Navy", "White"],
        stock: 60,
        images: [
            "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=400&auto=format&fit=crop",
        description: "Premium fleece team hoodie with kangaroo pocket.",
        isNew: true,
        isBest: true
    },
    {
        id: 23,
        name: "Bench Coat - Winter",
        price: 150000,
        category: "teamwear",
        type: "custom",
        sizes: ["M", "L", "XL", "2XL", "3XL"],
        colors: ["Black", "Navy"],
        stock: 30,
        images: [
            "https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1544966503-7cc5ac882d5a?q=80&w=400&auto=format&fit=crop",
        description: "Heavy-duty bench coat for cold weather sideline protection.",
        isNew: false,
        isBest: false
    },

    // ===== SPORTSWEAR (Store) =====
    {
        id: 6,
        name: "Premium Compression Tights",
        price: 42000,
        category: "sportswear",
        type: "store",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "Navy"],
        stock: 200,
        images: [
            "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?q=80&w=400&auto=format&fit=crop",
        description: "High-performance compression tights for recovery.",
        isNew: false,
        isBest: true
    },
    {
        id: 24,
        name: "Dry-Fit Training T-Shirt",
        price: 28000,
        category: "sportswear",
        type: "store",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Black", "White", "Gray", "Navy"],
        stock: 300,
        images: [
            "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400&auto=format&fit=crop",
        description: "Quick-dry training t-shirt with UV protection.",
        isNew: false,
        isBest: false
    },
    {
        id: 25,
        name: "Performance Running Shorts",
        price: 32000,
        category: "sportswear",
        type: "store",
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "Gray", "Navy"],
        stock: 180,
        images: [
            "https://images.unsplash.com/photo-1562886877-aaaa5c17d1a4?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1562886877-aaaa5c17d1a4?q=80&w=400&auto=format&fit=crop",
        description: "Lightweight running shorts with built-in liner.",
        isNew: true,
        isBest: false
    },
    {
        id: 26,
        name: "Compression Arm Sleeves (Pair)",
        price: 18000,
        category: "sportswear",
        type: "store",
        sizes: ["S", "M", "L"],
        colors: ["Black", "White"],
        stock: 250,
        images: [
            "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=400&auto=format&fit=crop",
        description: "UV-protective compression arm sleeves for outdoor sports.",
        isNew: false,
        isBest: false
    },
    {
        id: 27,
        name: "Sports Headband Set (3pcs)",
        price: 15000,
        category: "sportswear",
        type: "store",
        sizes: ["Free"],
        colors: ["Black/White/Gray"],
        stock: 400,
        images: [
            "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=400&auto=format&fit=crop",
        description: "Moisture-wicking sports headband set. 3 colors included.",
        isNew: false,
        isBest: false
    },

    // ===== ACCESSORIES (Store) =====
    {
        id: 5,
        name: "Molten BG4500 Basketball",
        price: 75000,
        category: "accessories",
        type: "store",
        sizes: ["7"],
        colors: ["Orange/Ivory"],
        stock: 50,
        images: [
            "https://images.unsplash.com/photo-1519861531473-92002639314e?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1519861531473-92002639314e?q=80&w=400&auto=format&fit=crop",
        description: "FIBA approved official game ball.",
        isNew: false,
        isBest: true
    },
    {
        id: 8,
        name: "Team Equipment Bag",
        price: 65000,
        category: "accessories",
        type: "store",
        sizes: ["Free"],
        colors: ["Black", "Navy"],
        stock: 40,
        images: [
            "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=400&auto=format&fit=crop",
        description: "Large capacity bag for team equipment.",
        isNew: false,
        isBest: false
    },
    {
        id: 28,
        name: "Knee Pad - Volleyball/Basketball",
        price: 22000,
        category: "accessories",
        type: "store",
        sizes: ["S", "M", "L"],
        colors: ["Black", "White"],
        stock: 150,
        images: [
            "https://images.unsplash.com/photo-1576678927484-cc907957088c?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1576678927484-cc907957088c?q=80&w=400&auto=format&fit=crop",
        description: "Protective knee pads with EVA foam cushioning.",
        isNew: false,
        isBest: false
    },
    {
        id: 29,
        name: "Sports Water Bottle - 1L",
        price: 12000,
        category: "accessories",
        type: "store",
        sizes: ["Free"],
        colors: ["Black", "White", "Blue"],
        stock: 500,
        images: [
            "https://images.unsplash.com/photo-1602143407151-7111542de6e8?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?q=80&w=400&auto=format&fit=crop",
        description: "BPA-free squeeze water bottle with measurement markings.",
        isNew: false,
        isBest: false
    },
    {
        id: 30,
        name: "Ankle Support Brace (Pair)",
        price: 28000,
        category: "accessories",
        type: "store",
        sizes: ["S", "M", "L"],
        colors: ["Black"],
        stock: 120,
        images: [
            "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=400&auto=format&fit=crop",
        description: "Adjustable ankle brace with compression support.",
        isNew: true,
        isBest: false
    },

    // ===== KOGAS MD (Store) =====
    {
        id: 3,
        name: "KOGAS Official Home Jersey",
        price: 89000,
        category: "kogas",
        type: "store",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["Blue"],
        stock: 30,
        images: [
            "https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=400&auto=format&fit=crop",
        description: "Official 24/25 Season Home Jersey of KOGAS Pegasus.",
        isNew: false,
        isBest: true
    },
    {
        id: 31,
        name: "KOGAS Away Jersey",
        price: 89000,
        category: "kogas",
        type: "store",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["White"],
        stock: 25,
        images: [
            "https://images.unsplash.com/photo-1473042904451-00171c69419d?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1473042904451-00171c69419d?q=80&w=400&auto=format&fit=crop",
        description: "Official 24/25 Season Away Jersey of KOGAS Pegasus.",
        isNew: true,
        isBest: false
    },
    {
        id: 32,
        name: "KOGAS Team Scarf",
        price: 25000,
        category: "kogas",
        type: "store",
        sizes: ["Free"],
        colors: ["Blue/White"],
        stock: 100,
        images: [
            "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=400&auto=format&fit=crop",
        description: "Official KOGAS Pegasus supporter scarf.",
        isNew: false,
        isBest: false
    },
    {
        id: 33,
        name: "KOGAS Cap - Snapback",
        price: 32000,
        category: "kogas",
        type: "store",
        sizes: ["Free"],
        colors: ["Blue", "Black"],
        stock: 80,
        images: [
            "https://images.unsplash.com/photo-1588850561407-ed78c334e67a?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1588850561407-ed78c334e67a?q=80&w=400&auto=format&fit=crop",
        description: "KOGAS Pegasus snapback cap with embroidered logo.",
        isNew: false,
        isBest: false
    },

    // ===== BASEBALL (Custom) =====
    {
        id: 9,
        name: "STIZ Custom Baseball Uniform",
        price: 62000,
        category: "baseball",
        type: "custom",
        sizes: ["S", "M", "L", "XL", "2XL"],
        colors: ["White", "Gray", "Navy"],
        stock: 60,
        images: [
            "https://images.unsplash.com/photo-1593034509785-5b17ba49f683?q=80&w=800&auto=format&fit=crop"
        ],
        image: "https://images.unsplash.com/photo-1593034509785-5b17ba49f683?q=80&w=400&auto=format&fit=crop",
        description: "Classic pinstripe baseball uniform with custom embroidery.",
        isNew: false,
        isBest: false
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
        filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // Filter by Type (custom vs store)
    if (type) {
        filtered = filtered.filter(p => p.type === type);
    }

    return filtered;
}

// Helper to get best sellers
function getBestSellers(limit = 8) {
    return products.filter(p => p.isBest).slice(0, limit);
}

// Helper to get new arrivals
function getNewArrivals(limit = 8) {
    return products.filter(p => p.isNew).slice(0, limit);
}
