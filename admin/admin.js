if (typeof supabase !== 'undefined') {
    console.log("✅ Supabase успешно подтянут из config.js");
} else {
    console.error("❌ Ошибка: config.js не передал настройки Supabase");
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
    else if (target === '#tab-history') {
        loadAdminHistory();
    }
    else if (target === '#tab-calendar' && typeof loadAdminCalendar === 'function') {
        loadAdminCalendar();
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
