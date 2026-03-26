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

    // 3. Generate Flow - 서버 AI API 호출 (실패 시 기존 Mock 이미지 폴백)
    btnGenerate.addEventListener('click', async () => {
        // 로딩 표시
        loader.classList.remove('hidden');
        resultPlaceholder.classList.add('hidden');
        resultContainer.classList.add('hidden');

        // 선택된 모델(Man/Woman) 확인 - active 클래스가 있는 버튼의 data 속성
        const activeModelBtn = document.querySelector('.model-select-btn.active');
        // data-model 속성이 없으면 버튼 텍스트에서 추론
        let model = 'man';
        if (activeModelBtn) {
            model = activeModelBtn.dataset.model
                || (activeModelBtn.textContent.toLowerCase().includes('woman') ? 'woman' : 'man');
        }

        try {
            // 서버의 AI 이미지 생성 API 호출
            const response = await fetch('http://localhost:3000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'mockup',
                    prompt: `Professional sportswear mockup photo, ${model === 'woman' ? 'female' : 'male'} athlete wearing custom team uniform, studio lighting, white background, high quality product photography`,
                    sourceImage: sourceImg?.src || null
                })
            });

            if (response.ok) {
                const data = await response.json();
                // 서버에서 받은 이미지 URL 표시
                resultImg.src = data.imageUrl || data.image || 'images/ai_samples/mockup_result.png';
            } else {
                throw new Error('API response not ok');
            }
        } catch (e) {
            // 서버 미실행 또는 API 실패 시 기존 Mock 이미지 표시
            resultImg.src = 'images/ai_samples/mockup_result.png';
        }

        // 로딩 숨기고 결과 표시
        loader.classList.add('hidden');
        resultContainer.classList.remove('hidden');
    });
});
