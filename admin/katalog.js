let catalogData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadCatalog();
});

async function loadCatalog() {
    const { data, error } = await supabase
        .from('task_catalog')
        .select('*')
        .order('category', { ascending: true });

    if (error) return console.error('Ошибка:', error);
    catalogData = data;
    renderCatalog();
}

function renderCatalog() {
    const searchTerm = document.getElementById('catalogSearch').value.toLowerCase();
    
    // Создаем "корзины" для каждой вкладки
    const buckets = { paid: {}, free: {}, demo: {} };

    // 1. Распределяем данные
    catalogData.forEach(item => {
        if (searchTerm && !item.task_name.toLowerCase().includes(searchTerm) && !item.category.toLowerCase().includes(searchTerm)) {
            return;
        }

        let type = 'free';
        if (item.task_type === 'demo') type = 'demo';
        else if (item.is_paid) type = 'paid';

        if (!buckets[type][item.category]) buckets[type][item.category] = [];
        buckets[type][item.category].push(item);
    });

    // 2. Отрисовываем каждую вкладку
    ['paid', 'free', 'demo'].forEach(type => {
        const containerId = 'accordion' + type.charAt(0).toUpperCase() + type.slice(1);
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        container.classList.add('catalog-half-width'); // Ограничиваем ширину для красоты

        let html = '';
        
        for (const [categoryName, items] of Object.entries(buckets[type])) {
            const categoryId = `cat-${type}-${categoryName.replace(/[^a-z0-9а-я]/gi, '-')}`;
            
            html += `
                <div class="category-block">
                    <div class="category-header d-flex justify-content-between align-items-center" 
                         style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#${categoryId}">
                        <div class="fw-bold text-dark text-uppercase small" style="letter-spacing: 0.5px;">
                            ${categoryName} <span class="badge bg-secondary ms-2 opacity-50 rounded-pill">${items.length}</span>
                        </div>
                        <button class="btn-icon-sm text-primary add-cat-btn" 
                                onclick="event.stopPropagation(); window.openCatalogModal('${categoryName}', '${type}')" 
                                title="Добавить услугу">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-plus-circle-fill" viewBox="0 0 16 16">
                              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.5 4.5a.5.5 0 0 0-1 0v3h-3a.5.5 0 0 0 0 1h3v3a.5.5 0 0 0 1 0v-3h3a.5.5 0 0 0 0-1h-3v-3z"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="collapse show" id="${categoryId}">
                        <div class="p-2 pb-1 bg-white">
                            ${items.map(item => renderHybridRow(item)).join('')}
                            
                            <div class="add-task-row p-2 small mt-1 rounded-2 fw-bold" 
                                 style="cursor: pointer;" 
                                 onclick="window.openCatalogModal('${categoryName}', '${type}')">
                                <span class="fs-5 me-1" style="vertical-align: sub;">+</span> Добавить услугу
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Большая пунктирная кнопка новой категории в самом низу вкладки
        html += `
            <div class="add-category-row p-3 mt-3 text-muted border border-2 rounded-3 text-center fw-bold" 
                 style="cursor: pointer;" 
                 onclick="window.openCatalogModal('', '${type}')">
                <span class="fs-5 me-2" style="vertical-align: sub;">+</span> Добавить новую категорию
            </div>
        `;
        
        container.innerHTML = html;
    });
}

function renderHybridRow(item) {
    const lockIcon = item.is_active ? '🔓' : '🔒';
    const lockTitle = item.is_active ? 'Заблокировать' : 'Разблокировать';

    return `
        <div class="service-row-card ${!item.is_active ? 'blocked' : ''}">
            <span class="status-dot ${item.is_active ? 'dot-active' : 'dot-blocked'}"></span>
            <div class="service-name text-dark">${item.task_name}</div>
            <div class="service-controls">
                <span class="service-time">${item.default_duration}м</span>
                <button class="btn-icon-sm" title="Редактировать" onclick='editService(${JSON.stringify(item).replace(/'/g, "&#39;")})'>✏️</button>
                <button class="btn-icon-sm" title="${lockTitle}" onclick="toggleBlock(${item.id}, ${item.is_active})">${lockIcon}</button>
            </div>
        </div>
    `;
}

async function toggleBlock(id, currentStatus) {
    const { error } = await supabase
        .from('task_catalog')
        .update({ is_active: !currentStatus })
        .eq('id', id);

    if (!error) loadCatalog();
}

// Открытие модалки для ДОБАВЛЕНИЯ
window.openCatalogModal = function(category = '', type = 'paid') {
    const modal = new bootstrap.Modal(document.getElementById('catalogModal'));
    
    // Сбрасываем поля
    document.getElementById('cat-id').value = '';
    document.getElementById('cat-type').value = type;
    document.getElementById('cat-category').value = category;
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-duration').value = '30';
    document.getElementById('cat-is-active').checked = true;
    
    // Меняем заголовок
    document.querySelector('#catalogModal .modal-title').innerText = category ? 'Новая услуга' : 'Новая категория';
    
    modal.show();
};

// Открытие модалки для РЕДАКТИРОВАНИЯ
window.editService = function(item) {
    const modal = new bootstrap.Modal(document.getElementById('catalogModal'));
    
    // Заполняем поля
    document.getElementById('cat-id').value = item.id;
    document.getElementById('cat-type').value = item.task_type === 'demo' ? 'demo' : (item.is_paid ? 'paid' : 'free');
    document.getElementById('cat-category').value = item.category;
    document.getElementById('cat-name').value = item.task_name;
    document.getElementById('cat-duration').value = item.default_duration;
    document.getElementById('cat-is-active').checked = item.is_active;
    
    document.querySelector('#catalogModal .modal-title').innerText = 'Редактировать услугу';
    
    modal.show();
};

window.saveCatalogItem = async function() {
    const id = document.getElementById('cat-id').value;
    const type = document.getElementById('cat-type').value || 'paid'; // Берем тип из скрытого поля
    const category = document.getElementById('cat-category').value.trim();
    const taskName = document.getElementById('cat-name').value.trim();

    if (!category || !taskName) {
        alert('Пожалуйста, заполните категорию и название услуги.');
        return;
    }

    let duration = parseInt(document.getElementById('cat-duration').value) || 30;
    duration = Math.max(30, Math.round(duration / 30) * 30); // Округление до 30 мин

    const data = {
        category: category,
        task_name: taskName,
        default_duration: duration,
        is_active: document.getElementById('cat-is-active').checked,
        is_paid: type === 'paid',
        task_type: type,
        default_price: 0
    };

    const action = id 
        ? supabase.from('task_catalog').update(data).eq('id', id)
        : supabase.from('task_catalog').insert([data]);

    const { error } = await action;
    
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('catalogModal')).hide();
        loadCatalog();
    } else {
        console.error('Ошибка сохранения:', error);
        alert('Ошибка при сохранении. Проверьте консоль.');
    }
};