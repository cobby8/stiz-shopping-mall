document.addEventListener('DOMContentLoaded', () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sort-select');
    const productGrid = document.getElementById('product-grid');
    const products = Array.from(document.querySelectorAll('.product-card'));

    // Filter Logic
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Active State
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;

            products.forEach(product => {
                if (filter === 'all' || product.dataset.category === filter) {
                    product.style.display = 'block';
                } else {
                    product.style.display = 'none';
                }
            });
        });
    });

    // Sort Logic
    sortSelect.addEventListener('change', () => {
        const sortValue = sortSelect.value;

        const sortedProducts = products.sort((a, b) => {
            if (sortValue === 'price-asc') {
                return parseInt(a.dataset.price) - parseInt(b.dataset.price);
            } else if (sortValue === 'price-desc') {
                return parseInt(b.dataset.price) - parseInt(a.dataset.price);
            } else if (sortValue === 'newest') {
                return new Date(b.dataset.date) - new Date(a.dataset.date);
            }
        });

        // Re-append sorted elements
        sortedProducts.forEach(product => productGrid.appendChild(product));
    });
});
