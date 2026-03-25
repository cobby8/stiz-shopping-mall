/**
 * STIZ Design Lab Core Logic - V2.1 Production Ready
 * Powered by Fabric.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Canvas
    const canvas = new fabric.Canvas('c', {
        preserveObjectStacking: true, // Maintain layer order
        selection: true,
        backgroundColor: '#f3f4f6'
    });

    // 2. Advanced Product Rendering (Layered)
    const productState = {
        baseColor: '#ffffff',
        pointColor: '#000000',
        sport: 'soccer',
    };

    let layers = {
        bodyColorRect: null,
        pointColorRect: null,
    };

    // Sport-specific jersey templates
    const templates = {
        soccer: {
            body: { width: 300, height: 380, top: 130, left: 150 },
            sleeves: [
                { width: 70, height: 160, top: 130, left: 80 },
                { width: 70, height: 160, top: 130, left: 450 }
            ],
            collar: { width: 120, height: 25, top: 105, left: 240 },
            label: 'Soccer Jersey'
        },
        basketball: {
            body: { width: 280, height: 400, top: 120, left: 160 },
            sleeves: [
                { width: 40, height: 120, top: 120, left: 120 },
                { width: 40, height: 120, top: 120, left: 440 }
            ],
            collar: { width: 160, height: 40, top: 80, left: 220 },
            label: 'Basketball Jersey'
        },
        volleyball: {
            body: { width: 320, height: 370, top: 140, left: 140 },
            sleeves: [
                { width: 80, height: 140, top: 140, left: 60 },
                { width: 80, height: 140, top: 140, left: 460 }
            ],
            collar: { width: 100, height: 20, top: 120, left: 250 },
            label: 'Volleyball Jersey'
        },
        baseball: {
            body: { width: 310, height: 400, top: 120, left: 145 },
            sleeves: [
                { width: 90, height: 200, top: 120, left: 55 },
                { width: 90, height: 200, top: 120, left: 455 }
            ],
            collar: { width: 80, height: 30, top: 90, left: 260 },
            label: 'Baseball Jersey'
        }
    };

    window.loadLayeredProduct = function (type) {
        canvas.clear();
        canvas.setBackgroundColor('#f3f4f6', canvas.renderAll.bind(canvas));

        layers.bodyColorRect = null;
        layers.pointColorRect = null;

        productState.sport = type;
        const tmpl = templates[type] || templates.soccer;

        // A. Body Layer (Main Color)
        const bodyMask = new fabric.Rect({
            ...tmpl.body, rx: 8, ry: 8,
            absolutePositioned: true
        });
        layers.bodyColorRect = new fabric.Rect({
            left: 0, top: 0, width: 600, height: 700,
            fill: productState.baseColor,
            selectable: false, evented: false
        });
        layers.bodyColorRect.clipPath = bodyMask;
        canvas.add(layers.bodyColorRect);

        // B. Point Layer (Trim) - Sleeves/Collar
        const pointShapes = [];
        tmpl.sleeves.forEach(s => pointShapes.push(new fabric.Rect({ ...s, rx: 4, ry: 4 })));
        pointShapes.push(new fabric.Rect({ ...tmpl.collar, rx: 4, ry: 4 }));

        const pointMaskGroup = new fabric.Group(pointShapes, { absolutePositioned: true });
        layers.pointColorRect = new fabric.Rect({
            left: 0, top: 0, width: 600, height: 700,
            fill: productState.pointColor,
            selectable: false, evented: false
        });
        layers.pointColorRect.clipPath = pointMaskGroup;
        canvas.add(layers.pointColorRect);

        // C. Outline for realism
        canvas.add(new fabric.Rect({
            ...tmpl.body, rx: 8, ry: 8,
            fill: 'transparent', stroke: 'rgba(0,0,0,0.1)', strokeWidth: 2,
            selectable: false, evented: false
        }));

        updateSummary();
    };

    // Player number/name marking
    window.addPlayerNumber = function () {
        const numInput = document.getElementById('player-number');
        const num = numInput ? numInput.value : '10';
        const text = new fabric.IText(num, {
            left: 260, top: 280,
            fontFamily: "'Anton', sans-serif",
            fill: productState.pointColor === '#ffffff' ? '#000000' : '#ffffff',
            fontSize: 120, textAlign: 'center',
            originX: 'center'
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    };

    window.addPlayerName = function () {
        const nameInput = document.getElementById('player-name');
        const name = nameInput ? nameInput.value : 'PLAYER';
        const text = new fabric.IText(name.toUpperCase(), {
            left: 300, top: 200,
            fontFamily: "'Anton', sans-serif",
            fill: productState.pointColor === '#ffffff' ? '#000000' : '#ffffff',
            fontSize: 36, textAlign: 'center',
            originX: 'center', charSpacing: 200
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    };

    function updateSummary() {
        const summaryColor = document.getElementById('summary-color');
        const tmpl = templates[productState.sport] || templates.soccer;
        if (summaryColor) {
            summaryColor.innerHTML = `
                <div class="flex flex-col text-xs space-y-1">
                    <span class="font-bold text-gray-700 mb-1">${tmpl.label}</span>
                    <span class="flex items-center"><span class="w-3 h-3 rounded-full border border-gray-200 mr-2" style="background-color:${productState.baseColor}"></span> Main: ${productState.baseColor}</span>
                    <span class="flex items-center"><span class="w-3 h-3 rounded-full border border-gray-200 mr-2" style="background-color:${productState.pointColor}"></span> Point: ${productState.pointColor}</span>
                </div>
             `;
        }
    }

    // Override Global Switcher
    window.changeBaseProduct = function (url, name) {
        const sport = name.toLowerCase().includes('soccer') ? 'soccer'
            : name.toLowerCase().includes('basket') ? 'basketball'
            : name.toLowerCase().includes('volley') ? 'volleyball'
            : name.toLowerCase().includes('base') ? 'baseball'
            : 'soccer';
        loadLayeredProduct(sport);
        const summaryModel = document.querySelector('.w-72 .font-medium');
        if (summaryModel) summaryModel.textContent = name;
    };

    // Initialize
    loadLayeredProduct('soccer');


    /* 3. Coloring Logic */
    const colors = ['#ffffff', '#111111', '#e21818', '#0026e6', '#fae100', '#008000', '#800080', '#ffa500', '#555555', '#191970'];

    function createPalette(id, onClick) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'w-10 h-10 rounded-full border border-gray-200 focus:ring-2 ring-offset-2 ring-black hover:scale-110 transition-transform';
            btn.style.backgroundColor = color;
            btn.onclick = () => onClick(color);
            el.appendChild(btn);
        });
    }

    // Main Body
    createPalette('color-palette-main', (color) => {
        if (layers.bodyColorRect) {
            layers.bodyColorRect.set('fill', color);
            productState.baseColor = color;
            updateSummary();
            canvas.requestRenderAll();
        }
    });

    // Point
    createPalette('color-palette-point', (color) => {
        if (layers.pointColorRect) {
            layers.pointColorRect.set('fill', color);
            productState.pointColor = color;
            updateSummary();
            canvas.requestRenderAll();
        }
    });

    // Text Color
    createPalette('text-color-palette', (color) => {
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            activeObj.set('fill', color);
            canvas.requestRenderAll();
        }
    });


    /* 4. Font & Text Logic */
    const fonts = [
        { name: 'Noto Sans KR', label: '본고딕 (Sans)', family: "'Noto Sans KR', sans-serif" },
        { name: 'Black Han Sans', label: '블랙한산스 (Title)', family: "'Black Han Sans', sans-serif" },
        { name: 'Gmarket Sans', label: 'G마켓 산스 (Bold)', family: "'Gmarket Sans', sans-serif" },
        { name: 'Do Hyeon', label: '도현체', family: "'Do Hyeon', sans-serif" },
        { name: 'Jua', label: '주아체', family: "'Jua', sans-serif" },
        { name: 'Yeon Sung', label: '연성체', family: "'Yeon Sung', cursive" },
        { name: 'Nanum Brush Script', label: '나눔브러쉬', family: "'Nanum Brush Script', cursive" },
        { name: 'Song Myung', label: '송명체 (Serif)', family: "'Song Myung', serif" },
        { name: 'Anton', label: 'Anton (Eng)', family: "'Anton', sans-serif" }
    ];

    const fontList = document.getElementById('font-list');
    let currentFont = "'Noto Sans KR', sans-serif";

    if (fontList) {
        fontList.innerHTML = '';
        fonts.forEach((font, index) => {
            const div = document.createElement('div');
            div.className = `font-preview-btn p-2 rounded cursor-pointer border border-transparent ${index === 0 ? 'active' : ''}`;
            div.style.fontFamily = font.family;
            div.innerHTML = `<span class="text-sm">${font.label}</span> <span class="text-xs text-gray-400 block">${font.name}</span>`;

            // Hover Preview
            div.addEventListener('mouseenter', () => {
                const activeObj = canvas.getActiveObject();
                if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
                    activeObj.set('fontFamily', font.family);
                    canvas.requestRenderAll();
                }
            });

            div.onclick = () => {
                document.querySelectorAll('.font-preview-btn').forEach(b => {
                    b.classList.remove('active', 'border-black');
                    b.classList.add('border-transparent');
                });
                div.classList.add('active', 'border-black');
                div.classList.remove('border-transparent');

                currentFont = font.family;

                const activeObj = canvas.getActiveObject();
                if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
                    activeObj.set('fontFamily', font.family);
                    canvas.requestRenderAll();
                }
            };
            fontList.appendChild(div);
        });
    }

    const addText = () => {
        const val = document.getElementById('text-input').value || 'STIZ';
        const text = new fabric.IText(val, {
            left: 200, top: 300,
            fontFamily: currentFont,
            fill: '#000000', fontSize: 60
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        document.getElementById('text-input').value = '';
    };

    document.getElementById('add-text-btn').addEventListener('click', addText);
    document.getElementById('text-input').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') addText();
    });

    /* 5. Logo & AI Tools */

    // A. Logo Upload
    const uploadInput = document.getElementById('logo-upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (f) {
                const data = f.target.result;
                fabric.Image.fromURL(data, function (img) {
                    img.scaleToWidth(150);
                    img.set({ left: 220, top: 250, borderColor: 'red', cornerColor: 'red', cornerSize: 8, transparentCorners: false });
                    canvas.add(img);
                    canvas.setActiveObject(img);
                });
            };
            reader.readAsDataURL(file);
            // Reset input so same file can be selected again
            uploadInput.value = '';
        });
    }

    // B. AI Emblem Generator
    let aiLogoColor = '#111111'; // Default

    // Logic to build the logo (Real Backend Call)
    window.generateAILogo = async function () {
        const teamName = document.getElementById('ai-team-name').value || 'STIZ FC';
        const slogan = document.getElementById('ai-slogan').value || '';
        const year = document.getElementById('ai-year').value || '';
        const style = document.getElementById('ai-logo-style').value || 'Emblem';
        const userRequest = document.getElementById('ai-logo-prompt').value || '';

        // Construct a rich prompt for the backend
        const fullPrompt = `Team Name: ${teamName}, Slogan: ${slogan}, Established: ${year}, Type: ${style}, Additional: ${userRequest}`;

        try {
            const response = await fetch('http://localhost:4000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: fullPrompt, // Logic Refiner will handle this
                    type: 'logo'
                })
            });

            const data = await response.json();

            if (data.success && data.imageUrl) {
                // Success! data.imageUrl is a Base64 string from Imagen 4.0
                fabric.Image.fromURL(data.imageUrl, function (img) {
                    // Optimized settings for Logo
                    img.scaleToWidth(200);   // Good size for logo
                    img.set({
                        left: 200,
                        top: 250,
                        cornerColor: '#E63946',
                        cornerSize: 10,
                        transparentCorners: false,
                        borderColor: '#E63946',
                    });

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    canvas.requestRenderAll();

                    // Optional: Determine if we need to add text separately?
                    // The AI might generate text inside the logo (often messy), or we can overlay it.
                    // For now, let's trust the AI image first.
                    alert("AI Logo Generated Successfully!");
                });

            } else {
                alert("AI Generation Failed: " + (data.message || "Unknown Error"));
            }

        } catch (err) {
            console.error(err);
            alert("Server Error. Check console.");
        }
    };

    // Initialize AI Color Palette
    const aiPalette = document.getElementById('ai-color-palette');
    if (aiPalette) {
        const logoColors = ['#111111', '#E63946', '#1D3557', '#F4A261', '#2A9D8F'];
        logoColors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'w-6 h-6 rounded-full border border-gray-200 focus:ring-1 ring-offset-1 ring-black';
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                aiLogoColor = color;
                // Visual feedback?
            };
            aiPalette.appendChild(btn);
        });
    }

    document.getElementById('btn-generate-ai-logo').addEventListener('click', () => {
        // Simulate Processing Time
        const btn = document.getElementById('btn-generate-ai-logo');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Generating...`;
        btn.disabled = true;

        setTimeout(() => {
            generateAILogo();
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 800); // 0.8s fake delay
    });

    // Zoom
    document.getElementById('zoom-in').addEventListener('click', () => canvas.setZoom(canvas.getZoom() * 1.1));
    document.getElementById('zoom-out').addEventListener('click', () => canvas.setZoom(canvas.getZoom() * 0.9));
    document.getElementById('clear-canvas').addEventListener('click', () => {
        // Re-load product
        loadLayeredProduct('basketball');
    });

    // Delete
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (document.activeElement.tagName !== 'INPUT') {
                const active = canvas.getActiveObjects();
                if (active.length) {
                    canvas.discardActiveObject();
                    active.forEach(o => canvas.remove(o));
                }
            }
        }
    });

    /* 6. Save & Download */
    window.saveDesign = function () {
        const designId = 'stiz_design_' + Date.now();
        // Generate Thumbnail (ignore errors if taint)
        let dataURL = '';
        try {
            dataURL = canvas.toDataURL({ format: 'png', multiplier: 0.5 });
        } catch (e) { console.warn('Canvas tainted', e); }

        const designData = {
            id: designId,
            date: new Date().toLocaleDateString(),
            preview: dataURL,
            productType: 'Custom Kit',
            json: JSON.stringify(canvas.toJSON())
        };

        const savedDesigns = JSON.parse(localStorage.getItem('stiz_saved_designs') || '[]');
        savedDesigns.push(designData);
        localStorage.setItem('stiz_saved_designs', JSON.stringify(savedDesigns));

        alert('Design Saved! Check "My Shop".');
    };

    window.downloadDesign = function () {
        try {
            const dataURL = canvas.toDataURL({ format: 'png', multiplier: 2 });
            const link = document.createElement('a');
            link.download = 'stiz_custom_design.png';
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            alert('Cannot download (CORS issue with external images). Try without external logos.');
        }
    };

    // Tabs
    const tabs = document.querySelectorAll('button[data-tab]');
    const panels = document.querySelectorAll('#tool-panel > div');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('border-b-2', 'border-black', 'text-black');
                t.classList.add('text-gray-400');
            });
            tab.classList.remove('text-gray-400');
            tab.classList.add('border-b-2', 'border-black', 'text-black');
            const target = tab.getAttribute('data-tab');
            panels.forEach(p => {
                p.classList.toggle('hidden', p.id !== `panel-${target}`);
            });
        });
    });

    // Design Lab V2.1 초기화 완료
});
