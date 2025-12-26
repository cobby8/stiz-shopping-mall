document.addEventListener('DOMContentLoaded', () => {
    const sourceImg = document.getElementById('source-design');
    const resultImg = document.getElementById('result-image');
    const resultContainer = document.getElementById('result-container');
    const resultPlaceholder = document.getElementById('result-placeholder');
    const loader = document.getElementById('fitting-loader');
    const btnGenerate = document.getElementById('btn-generate');
    const modelBtns = document.querySelectorAll('.model-select-btn');

    // 1. Load Source Design (from LocalStorage or Default)
    const storedDesign = localStorage.getItem('stiz_mockup_source');
    if (storedDesign) {
        sourceImg.src = storedDesign;
    }

    // 2. toggle Model Selection
    modelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modelBtns.forEach(b => {
                b.classList.remove('border-2', 'border-black', 'active');
                b.classList.add('border', 'border-gray-200');
            });
            btn.classList.add('border-2', 'border-black', 'active');
            btn.classList.remove('border', 'border-gray-200');
        });
    });

    // 3. Generate Flow
    btnGenerate.addEventListener('click', () => {
        // Show Loader
        loader.classList.remove('hidden');

        // Hide Placeholder/Result
        resultPlaceholder.classList.add('hidden');
        resultContainer.classList.add('hidden');

        // Simulate AI Processing (3.5s)
        setTimeout(() => {
            loader.classList.add('hidden');
            resultContainer.classList.remove('hidden');

            // Set Result Image
            // In a real app, this would depend on the selected model + source design
            resultImg.src = 'images/ai_samples/mockup_result.png';

        }, 3500);
    });
});
