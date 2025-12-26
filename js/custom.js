/**
 * STIZ Design Lab Core Logic
 * Powered by Fabric.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Canvas
    const canvas = new fabric.Canvas('c', {
        preserveObjectStacking: true, // Maintain layer order
        selection: true
    });

    // Default Configuration
    const config = {
        baseColor: '#ffffff',
        width: 600,
        height: 700
    };

    // 2. Load Base Uniform Template (Mockup)

    let baseJersey;

    // Improved Basketball Jersey Path (Tank top style)
    // This path represents a basketball jersey silhouette
    const jerseyPathData = "M183.5,68.2c0,0,32.1,38.5,66.4,38.5c34.3,0,66.4-38.5,66.4-38.5l25.7-8.6l-12.8,96.3c0,0,10.7,21.4-15,62.1 c0,0,6.4,357.5,6.4,363.9H129.5c0-6.4,6.4-363.9,6.4-363.9c-25.7-40.7-15-62.1-15-62.1l-12.8-96.3L183.5,68.2z";


    // Background Rect (for colorizing)
    const bgRect = new fabric.Rect({
        width: 600,
        height: 700,
        fill: '#ffffff',
        selectable: false,
        evented: false
    });
    canvas.add(bgRect);

    // Jersey Path Object
    const jerseyPath = new fabric.Path(jerseyPathData, {
        fill: '#ffffff',
        stroke: '#e5e7eb',
        strokeWidth: 2,
        scaleX: 1.8,
        scaleY: 1.8,
        left: 85,
        top: 80,
        selectable: false,
        evented: false, // Make it background
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 10, offsetX: 5, offsetY: 5 })
    });
    canvas.add(jerseyPath);
    baseJersey = jerseyPath;

    // Add some text for effect
    const demoText = new fabric.IText('STIZ', {
        fontFamily: 'Black Ops One',
        fontSize: 50,
        fill: '#111111',
        left: 235,
        top: 250
    });
    canvas.add(demoText);
    canvas.setActiveObject(demoText);

    // 3. UI Interaction Handlers

    // Tab Switching
    const tabs = document.querySelectorAll('button[data-tab]');
    const panels = document.querySelectorAll('#tool-panel > div');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Reset Styles
            tabs.forEach(t => {
                t.classList.remove('border-b-2', 'border-black', 'text-black');
                t.classList.add('text-gray-400');
            });
            // Active Style
            tab.classList.remove('text-gray-400');
            tab.classList.add('border-b-2', 'border-black', 'text-black');

            // Show Panel
            const target = tab.getAttribute('data-tab');
            panels.forEach(p => {
                if (p.id === `panel-${target}`) p.classList.remove('hidden');
                else p.classList.add('hidden');
            });
        });
    });

    // Color Palette Generator
    const colors = ['#ffffff', '#000000', '#ff0000', '#0000ff', '#ffff00', '#008000', '#800080', '#ffa500', '#a52a2a', '#708090', '#191970', '#800000', '#556b2f', '#4b0082'];
    const palette = document.getElementById('color-palette');
    const textPalette = document.getElementById('text-color-palette');

    function createPaletteItems(container, onClick) {
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'w-10 h-10 rounded-full border border-gray-200 focus:ring-2 ring-offset-2 ring-black hover:scale-110 transition-transform';
            btn.style.backgroundColor = color;
            btn.onclick = () => onClick(color);
            container.appendChild(btn);
        });
    }

    // Change Jersey Color
    createPaletteItems(palette, (color) => {
        if (baseJersey) {
            baseJersey.set('fill', color);
            // Smart color contrast for outline
            baseJersey.set('stroke', color === '#ffffff' ? '#e5e7eb' : 'transparent');
            canvas.requestRenderAll();

            // Update Summary
            const summary = document.getElementById('summary-color');
            if (summary) summary.innerText = color;
            if (summary) summary.style.color = color;
        }
    });

    // Change Text Color (Active Object)
    createPaletteItems(textPalette, (color) => {
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            activeObj.set('fill', color);
            canvas.requestRenderAll();
        }
    });

    // Font Selection Logic
    const fontSelect = document.getElementById('font-family');

    // Change font of selected object
    fontSelect.addEventListener('change', (e) => {
        const fontFamily = e.target.value;
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            activeObj.set('fontFamily', fontFamily);
            canvas.requestRenderAll();
        }
    });

    // Sync font select with selected object
    canvas.on('selection:created', (e) => {
        const activeObj = e.selected[0];
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            fontSelect.value = activeObj.fontFamily;
        }
    });
    canvas.on('selection:updated', (e) => {
        const activeObj = e.selected[0];
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            fontSelect.value = activeObj.fontFamily;
        }
    });

    // Add Text Logic
    document.getElementById('add-text-btn').addEventListener('click', () => {
        const val = document.getElementById('text-input').value || '00';
        const fontFamily = fontSelect.value || 'Anton';

        const text = new fabric.IText(val, {
            left: 250,
            top: 300,
            fontFamily: fontFamily,
            fill: '#000000',
            fontSize: 60
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        document.getElementById('text-input').value = '';
    });

    // Image Upload Logic
    document.getElementById('logo-upload').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (f) {
            const data = f.target.result;
            fabric.Image.fromURL(data, function (img) {
                img.scaleToWidth(150);
                img.set({
                    left: 220,
                    top: 250
                });
                canvas.add(img);
                canvas.setActiveObject(img);
            });
        };
        reader.readAsDataURL(file);
    });

    // Zoom Controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        canvas.setZoom(canvas.getZoom() * 1.1);
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
        canvas.setZoom(canvas.getZoom() * 0.9);
    });
    document.getElementById('clear-canvas').addEventListener('click', () => {
        // Keep the jersey, remove everything else
        canvas.getObjects().forEach(o => {
            if (o !== baseJersey && o !== bgRect) {
                canvas.remove(o);
            }
        });
    });

    // Delete Object with Delete Key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only if not typing in input (and not in select)
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
                const active = canvas.getActiveObjects();
                if (active.length) {
                    canvas.discardActiveObject();
                    active.forEach(o => canvas.remove(o));
                }
            }
        }
    });

    // Add Logo Global Function
    window.addLogoFromUrl = function (url) {
        fabric.Image.fromURL(url, function (img) {
            img.scaleToWidth(100);
            img.set({ left: 250, top: 300 });
            canvas.add(img);
            canvas.setActiveObject(img);
        }, { crossOrigin: 'anonymous' }); // Important for external images
    };

    console.log('Design Lab Initialized');
});
