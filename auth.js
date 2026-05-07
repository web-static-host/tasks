let currentUser = null;

async function login(event) {
    if (event) event.preventDefault();
    
    const loginInput = document.getElementById('username').value.trim();
    const passInput = document.getElementById('password').value.trim();
    const btn = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerText = "Вход...";

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', loginInput)
            .eq('password', passInput)
            .eq('is_active', true)
            .single();

        if (error || !user) throw new Error("Ошибка входа");

        currentUser = await processUserRoles(user);
        
        // КЭШИРУЕМ: Сохраняем профиль сразу при входе
        localStorage.setItem('cache_current_user', JSON.stringify(currentUser));
        
        // ЖЕСТКО СТАВИМ ФИЛЬТР ПРИ ВХОДЕ
        if (currentUser.role === 'specialist' || currentUser.role === 'specialist_1c') {
            localStorage.setItem('activeTechFilter', currentUser.name);
            window.activeTechFilter = currentUser.name;
        } else {
            localStorage.removeItem('activeTechFilter'); 
            window.activeTechFilter = '';
        }

        if (document.getElementById('rememberMe').checked) {
            localStorage.setItem('savedUserId', currentUser.id);
        }

        await finishLoginSequence();
        showMainContent();

    } catch (err) {
        alert("Неверный логин или пароль!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Войти";
    }
}

// ФУНКЦИЯ ВЫХОДА (Термоядерная очистка)
function logout() {
    if (confirm("Выйти из системы?")) {
        // Очищаем абсолютно ВСЁ: кэш, пользователя, фильтры, галочки и даты
        localStorage.clear();
        sessionStorage.clear();
        
        currentUser = null;
        window.activeTechFilter = '';
        
        // Полная перезагрузка страницы для идеального сброса состояния
        location.reload();
    }
}

function showMainContent() {
    const auth = document.getElementById('auth-screen');
    const main = document.getElementById('main-content');

    if (auth) auth.style.display = 'none';
    if (main) main.style.display = 'block';
    document.body.style.display = 'block'; 

    if (typeof applySavedFiltersVisuals === 'function') applySavedFiltersVisuals();
    
    const nameDisplay = document.getElementById('current-user-name');
    if (nameDisplay && currentUser) nameDisplay.innerText = currentUser.name;

    if (typeof setupInterface === 'function') setupInterface();
    if (typeof loadTasks === 'function') loadTasks();
}

// ГЛАВНАЯ ФУНКЦИЯ ЗАПУСКА
async function initApp() {
    const savedId = localStorage.getItem('savedUserId');
    const cachedUser = localStorage.getItem('cache_current_user');
    
    if (savedId && cachedUser) {
        currentUser = JSON.parse(cachedUser);
        
        // === ИСПРАВЛЕНИЕ: СНАЧАЛА ждем инициализацию фильтров и данных ===
        await finishLoginSequence(); 
        
        // === ПОТОМ рисуем интерфейс ===
        if (document.getElementById('main-content')) {
            showMainContent();
        }
        return;
    }

    // Если входа нет и мы на главной — показываем экран логина
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.style.display = 'block';
        document.body.style.display = 'block';
    }
}

// Запускаем всё ОДИН РАЗ при загрузке
window.addEventListener('DOMContentLoaded', initApp);

async function processUserRoles(user) {
    const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id);

    const roleIds = userRoles.map(ur => Number(ur.role_id));
    
    let legacyRole = 'manager';
    if (roleIds.includes(1)) legacyRole = 'admin';
    else if (roleIds.includes(3)) legacyRole = 'specialist'; 
    else if (roleIds.includes(4)) legacyRole = 'specialist_1c';
    else if (roleIds.includes(5)) legacyRole = 'director';

    return {
        id: user.id,
        name: user.display_name || user.full_name,
        role: legacyRole,
        dept: user.dept || "Общий отдел"
    };
}

async function finishLoginSequence() {
    await Promise.all([
        typeof syncUsersWithLoginList === 'function' ? syncUsersWithLoginList() : Promise.resolve(),
        typeof syncSpecialistsWithConfig === 'function' ? syncSpecialistsWithConfig() : Promise.resolve()
    ]);

    if (typeof initFilters === 'function') {
        initFilters();
    }

    // Загружаем производственный календарь для всей системы
    await syncProductionCalendar();
}

async function syncProductionCalendar() {
    // Мгновенно: из кэша
    try {
        const raw = localStorage.getItem('production_calendar');
        window.productionCalendar = raw ? JSON.parse(raw) : {};
    } catch (e) {
        window.productionCalendar = {};
    }

    // Фоново: из БД
    try {
        const { data: rows, error } = await supabase
            .from('production_calendar')
            .select('year, data');

        if (error) throw error;

        if (rows && rows.length > 0) {
            const fresh = {};
            rows.forEach(row => { fresh[String(row.year)] = row.data; });

            if (JSON.stringify(fresh) !== JSON.stringify(window.productionCalendar)) {
                window.productionCalendar = fresh;
                localStorage.setItem('production_calendar', JSON.stringify(fresh));
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки производственного календаря:', e);
    }
}