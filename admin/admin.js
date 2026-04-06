if (typeof supabase === 'undefined') {
    var supabase; 
}

try {
    // Используем данные из твоего CONFIG
    supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    console.log("✅ Supabase доступен");
} catch (err) {
    console.error("❌ Ошибка инициализации Supabase:", err);
}

// 1. Управление доступом (шестеренка на главной)
function updateAdminUI(roles) {
    const adminLink = document.getElementById('admin-link');
    if (adminLink) {
        if (roles && roles.includes('Администратор')) {
            adminLink.classList.remove('d-none');
            adminLink.onclick = () => window.goToAdmin();
        } else {
            adminLink.classList.add('d-none');
        }
    }
}

// Переход в админку (вызывается из index.html)
window.goToAdmin = function() {
    localStorage.setItem('admin_mode', 'true');
    window.location.href = 'admin/admin.html';
};

// Выход из админки (вызывается из admin.html)
window.exitAdmin = function() {
    localStorage.removeItem('admin_mode');
    window.location.href = '../index.html';
};


// 2. Инициализация при загрузке страницы admin.html
document.addEventListener('DOMContentLoaded', async () => {
    // Проверяем, что мы именно на странице админки
    const adminScreen = document.getElementById('admin-screen');
    if (!adminScreen) return;

    // --- АВТОНОМНАЯ ПРОВЕРКА ДОСТУПА ---
    const cachedUser = JSON.parse(localStorage.getItem('cache_current_user'));
    
    // Если пользователя нет в кэше или он не админ — выкидываем на главную
    if (!cachedUser || cachedUser.role !== 'admin') {
        window.location.href = '../index.html';
        return;
    }

    // Показываем контент (так как body изначально может быть скрыт стилями auth.js)
    document.body.style.display = 'block';

    // --- 1. ЛОГИКА ГАЛОЧКИ  ---
    const hideInactiveCheck = document.getElementById('hide-inactive-check');
    if (hideInactiveCheck) {
        // Восстанавливаем состояние из памяти
        const savedState = localStorage.getItem('admin_hide_inactive');
        if (savedState !== null) {
            hideInactiveCheck.checked = (savedState === 'true');
        }

        // Вешаем событие на будущее
        hideInactiveCheck.addEventListener('change', () => {
            localStorage.setItem('admin_hide_inactive', hideInactiveCheck.checked);
            // Если мы на вкладке пользователей, обновляем список
            if (typeof loadAdminUsers === 'function') loadAdminUsers();
        });
    }

    // --- ОСТАЛЬНАЯ ЛОГИКА ТАБОВ ---
    const lastTab = localStorage.getItem('active_admin_tab') || '#tab-users';
    const tabBtn = document.querySelector(`button[data-bs-target="${lastTab}"]`);
    
    if (tabBtn) {
        const tabInstance = bootstrap.Tab.getOrCreateInstance(tabBtn);
        tabInstance.show();
        loadDataForTab(lastTab);
    }

    // Слушатель переключения вкладок
    document.querySelectorAll('#admin-screen [data-bs-toggle="pill"]').forEach(btn => {
        btn.addEventListener('show.bs.tab', (e) => {
            const target = e.target.getAttribute('data-bs-target');
            localStorage.setItem('active_admin_tab', target);
            loadDataForTab(target);
        });
    });

    if (typeof loadDepartmentsToSelect === 'function') {
        loadDepartmentsToSelect();
    }

    
});

// Функция-распределитель загрузки данных
function loadDataForTab(target) {
        
    if (target === '#tab-users' && typeof loadAdminUsers === 'function') {
        loadAdminUsers();
    } 
    // Исправляем условие для технарей:
    else if (target === '#tab-tech-config' && typeof loadTechSchedules === 'function') {
        loadTechSchedules();
    }
    else if (target === '#tab-services' && typeof loadAdminCatalog === 'function') {
        loadAdminCatalog();
    }
}

// --- 3. НАСТРОЙКИ ГРАФИКОВ ---
async function loadAdminSettings() {
    const container = document.getElementById('admin-tech-settings');
    if (!container) return;

    const { data: settings, error } = await supabase
        .from('specialist_settings')
        .select('*, users(full_name)');

    if (error) return console.error(error);

    let html = `<div class="row">`;
    settings.forEach(s => {
        html += `
            <div class="col-md-6 mb-3">
                <div class="card border shadow-sm h-100">
                    <div class="card-body">
                        <h6 class="card-title fw-bold border-bottom pb-2">${s.users?.full_name || 'Неизвестный'}</h6>
                        <div class="row g-2 pt-2">
                            <div class="col-6"><small class="text-muted">Будни:</small> <input type="time" class="form-control form-control-sm" value="${s.work_start}" onchange="updateTechSet('${s.user_id}', 'work_start', this.value)"></div>
                            <div class="col-6"><small class="text-muted">Конец:</small> <input type="time" class="form-control form-control-sm" value="${s.work_end}" onchange="updateTechSet('${s.user_id}', 'work_end', this.value)"></div>
                            <div class="col-6"><small class="text-muted">Обед с:</small> <input type="time" class="form-control form-control-sm" value="${s.lunch_start}" onchange="updateTechSet('${s.user_id}', 'lunch_start', this.value)"></div>
                            <div class="col-6"><small class="text-muted">Обед по:</small> <input type="time" class="form-control form-control-sm" value="${s.lunch_end}" onchange="updateTechSet('${s.user_id}', 'lunch_end', this.value)"></div>
                        </div>
                    </div>
                </div>
            </div>`;
    });
    container.innerHTML = html + '</div>';
}

window.updateTechSet = async function(userId, field, value) {
    await supabase.from('specialist_settings').update({ [field]: value }).eq('user_id', userId);
};

// --- 4. КАТАЛОГ УСЛУГ ---
async function loadAdminCatalog() {
    const container = document.getElementById('admin-catalog-list') || document.getElementById('tab-services'); 
    // Проверь ID в HTML, выше в твоем коде было два разных варианта
    if (!container) return;

    const { data: catalog, error } = await supabase.from('task_catalog').select('*').order('category');
    if (error) return;

    let html = `<div class="table-responsive"><table class="table table-sm table-hover align-middle">
        <thead class="table-light"><tr><th>Категория</th><th>Задача</th><th>Мин.</th><th>Цена</th><th>Тип</th></tr></thead>
        <tbody>`;
    
    catalog.forEach(item => {
        html += `
            <tr>
                <td><small class="text-muted">${item.category}</small></td>
                <td><span class="fw-medium">${item.task_name}</span></td>
                <td><input type="number" class="form-control form-control-sm" style="width:70px" value="${item.default_duration}" onchange="updateCatalogItem(${item.id}, 'default_duration', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm" style="width:100px" value="${item.default_price}" onchange="updateCatalogItem(${item.id}, 'default_price', this.value)"></td>
                <td>${item.is_paid ? '💰' : '🆓'}</td>
            </tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';
}

window.updateCatalogItem = async function(id, field, value) {
    await supabase.from('task_catalog').update({ [field]: value }).eq('id', id);
};