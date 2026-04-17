let catalogData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadCatalog();
});

// Загружаем с сортировкой по индексу перетаскивания
async function loadCatalog() {
    const { data, error } = await supabase
        .from('task_catalog')
        .select('*')
        .order('order_index', { ascending: true });

    if (error) return console.error('Ошибка:', error);
    catalogData = data;
    renderCatalog();
}

window.renderCatalog = function() {
    const searchTerm = document.getElementById('catalogSearch')?.value.toLowerCase() || '';
    const onlyActive = document.getElementById('cat-active-filter')?.checked;
    
    const buckets = { paid: {}, free: {}, demo: {} };

    catalogData.forEach(item => {
        // Фильтр активности
        if (onlyActive && !item.is_active) return;
        
        // Поиск
        if (searchTerm && !item.task_name.toLowerCase().includes(searchTerm) && !item.category.toLowerCase().includes(searchTerm)) {
            return;
        }

        let type = 'free';
        if (item.task_type === 'demo') type = 'demo';
        else if (item.is_paid) type = 'paid';

        if (!buckets[type][item.category]) buckets[type][item.category] = [];
        buckets[type][item.category].push(item);
    });

    ['paid', 'free', 'demo'].forEach(type => {
        const container = document.getElementById('accordion' + type.charAt(0).toUpperCase() + type.slice(1));
        if (!container) return;

        let html = `<div class="row g-3 sortable-categories" data-type="${type}">`;

        Object.keys(buckets[type]).forEach(category => {
            html += `
                <div class="col-md-4 category-col" data-category="${category}">
                    <div class="category-block">
                        <div class="category-header d-flex align-items-center">
                            <span class="drag-handle cat-drag text-muted" style="cursor: grab; margin-right: 8px;">
                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>
                            </span>
                            <h6 class="m-0 fw-bold category-title-edit flex-grow-1" contenteditable="true" 
                                onblur="renameCategory('${category}', this.innerText, '${type}')">${category}</h6>
                        </div>
                        <div class="category-content sortable-tasks" data-category="${category}">`;

            buckets[type][category].forEach(item => {
                const isBlocked = !item.is_active ? 'blocked' : '';
                let dotClass = 'dot-blocked';
                if (item.is_active) {
                    if (type === 'paid') dotClass = 'dot-paid';
                    else if (type === 'free') dotClass = 'dot-free';
                    else if (type === 'demo') dotClass = 'dot-demo';
                }

                const durationHtml = type === 'free' ? '' : 
                    `<div class="service-time">
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16" style="margin-right:4px; margin-bottom:2px;"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                        ${item.default_duration} мин
                    </div>`;

                // ИСПРАВЛЕНИЕ: добавлены кавычки '${item.id}' в функцию редактирования
                html += `
                    <div class="service-row-card ${isBlocked}" data-id="${item.id}">
                        <span class="drag-handle task-drag" style="cursor: grab; margin-right: 8px; color: #adb5bd;">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>
                        </span>
                        <span class="status-dot ${dotClass}"></span>
                        <span class="service-name fw-medium" title="${item.task_name}">${item.task_name}</span>
                        
                        <div class="service-controls">
                            ${durationHtml}
                            <button class="btn-icon-sm text-secondary" onclick="openEditCatalogModal('${item.id}')">
                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                            </button>
                        </div>
                    </div>`;
            });

            html += `
                        <div class="add-task-row text-center mt-2 p-1 rounded" style="cursor: pointer; font-size: 0.85rem;" onclick="openEditCatalogModal(null, '${category}', '${type}')">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16" style="margin-right:4px; margin-bottom:2px;"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z"/></svg>
                            Добавить услугу
                        </div>
                    </div>
                </div>
            </div>`;
        });

        html += `
            <div class="col-md-4">
                <div class="phantom-category" onclick="addNewCategory('${type}')">
                    <div class="text-center fw-bold">
                        <svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16" class="mb-2"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z"/></svg>
                        <br>Добавить категорию
                    </div>
                </div>
            </div>`;

        html += `</div>`;
        container.innerHTML = html;
    });

    initDragAndDrop();
};

function initDragAndDrop() {
    if (typeof Sortable === 'undefined') return;

    // Перетаскивание колонок
    document.querySelectorAll('.sortable-categories').forEach(el => {
        new Sortable(el, {
            group: 'categories',
            handle: '.cat-drag',
            animation: 150,
            onEnd: saveOrder
        });
    });

    // Перетаскивание задач
    document.querySelectorAll('.sortable-tasks').forEach(el => {
        new Sortable(el, {
            group: 'tasks',
            handle: '.task-drag',
            animation: 150,
            onEnd: async function (evt) {
                const itemEl = evt.item;
                const newCategory = evt.to.getAttribute('data-category');
                const taskId = itemEl.getAttribute('data-id');
                
                if (evt.from !== evt.to) {
                    await supabase.from('task_catalog').update({ category: newCategory }).eq('id', taskId);
                    const t = catalogData.find(x => String(x.id) === String(taskId));
                    if (t) t.category = newCategory;
                }
                saveOrder(); 
            }
        });
    });
}

// Сохранение порядка
async function saveOrder() {
    const updates = [];
    let orderIndex = 0;

    document.querySelectorAll('.sortable-categories').forEach(tab => {
        tab.querySelectorAll('.service-row-card').forEach(taskEl => {
            const id = taskEl.getAttribute('data-id');
            updates.push({ id: id, order_index: orderIndex++ });
        });
    });

    for (const update of updates) {
        await supabase.from('task_catalog').update({ order_index: update.order_index }).eq('id', update.id);
        const t = catalogData.find(x => String(x.id) === String(update.id));
        if (t) t.order_index = update.order_index;
    }
}

// Переименование категории inline
window.renameCategory = async function(oldName, newName, type) {
    const cleanNewName = newName.trim();
    if (!cleanNewName || cleanNewName === oldName) return renderCatalog(); 

    const { error } = await supabase
        .from('task_catalog')
        .update({ category: cleanNewName })
        .eq('category', oldName)
        .eq('task_type', type === 'paid' ? 'paid' : type); 

    if (!error) {
        catalogData.forEach(item => {
            if (item.category === oldName && (item.task_type === type || (type === 'paid' && item.is_paid))) {
                item.category = cleanNewName;
            }
        });
    }
    renderCatalog();
};

// Открытие модалки редактирования (ИСПРАВЛЕНО)
window.openEditCatalogModal = function(id = null, forceCategory = '', forceType = 'paid') {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('catalogModal'));
    const form = document.getElementById('catalog-form');
    form.reset();

    if (id) {
        const item = catalogData.find(i => String(i.id) === String(id));
        if (!item) return;
        document.getElementById('cat-id').value = item.id;
        document.getElementById('cat-type').value = item.task_type || (item.is_paid ? 'paid' : 'free');
        document.getElementById('cat-category').value = item.category;
        document.getElementById('cat-name').value = item.task_name;
        document.getElementById('cat-duration').value = item.default_duration;
        document.getElementById('cat-is-active').checked = item.is_active;
        document.querySelector('#catalogModal .modal-title').innerText = 'Редактировать услугу';
        
        document.getElementById('cat-duration-wrapper').style.display = (item.task_type === 'free') ? 'none' : 'block';
    } else {
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-type').value = forceType;
        document.getElementById('cat-category').value = forceCategory;
        document.getElementById('cat-is-active').checked = true;
        document.querySelector('#catalogModal .modal-title').innerText = 'Новая услуга';
        document.getElementById('cat-duration-wrapper').style.display = (forceType === 'free') ? 'none' : 'block';
    }
    
    modal.show();
};

// Сохранение задачи
window.saveCatalogItem = async function() {
    const id = document.getElementById('cat-id').value;
    const type = document.getElementById('cat-type').value || 'paid';
    const category = document.getElementById('cat-category').value.trim();
    const taskName = document.getElementById('cat-name').value.trim();

    if (!category || !taskName) {
        return alert('Пожалуйста, заполните категорию и название услуги.');
    }

    let duration = type === 'free' ? 0 : (parseInt(document.getElementById('cat-duration').value) || 30);
    duration = type === 'free' ? 0 : Math.max(30, Math.round(duration / 30) * 30);

    const data = {
        category: category,
        task_name: taskName,
        default_duration: duration,
        is_active: document.getElementById('cat-is-active').checked,
        is_paid: type === 'paid',
        task_type: type,
        ...(id ? {} : { order_index: catalogData.length }) 
    };

    const action = id 
        ? supabase.from('task_catalog').update(data).eq('id', id)
        : supabase.from('task_catalog').insert([data]);

    const { error } = await action;
    
    if (error) {
        console.error(error);
        alert('Ошибка при сохранении');
    } else {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('catalogModal')).hide();
        await loadCatalog(); 
    }
};

window.addNewCategory = function(type) {
    const catName = prompt("Введите название новой категории:");
    if (catName && catName.trim() !== "") {
        // Вызываем твою же модалку, подставляя введенное имя категории и текущую вкладку
        openEditCatalogModal(null, catName.trim(), type);
    }
};