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

// ФУНКЦИЯ ВЫХОДА (С очисткой кэша)
function logout() {
    if (confirm("Выйти из системы?")) {
        // Очищаем всё
        localStorage.removeItem('savedUserId');
        localStorage.removeItem('cache_current_user'); 
        localStorage.removeItem('cache_tech_users'); // Опционально: чистим и список технарей
        localStorage.removeItem('cache_spec_settings');
        
        currentUser = null;
        
        // Полная перезагрузка — самый быстрый способ сбросить состояние приложения
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


// 1. АВТОРИЗАЦИЯ И ИНИЦИАЛИЗАЦИЯ


// ГЛАВНАЯ ФУНКЦИЯ ЗАПУСКА
async function initApp() {
    const savedId = localStorage.getItem('savedUserId');
    const cachedUser = localStorage.getItem('cache_current_user');
    
    if (savedId && cachedUser) {
        currentUser = JSON.parse(cachedUser);
        // Если мы на главной (есть main-content), показываем её
        if (document.getElementById('main-content')) {
            showMainContent();
        }
        finishLoginSequence(); 
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

// Эта функция запускает всё остальное только когда мы вошли
async function finishLoginSequence() {

    // Запускаем обе функции одновременно
    await Promise.all([
        typeof syncUsersWithLoginList === 'function' ? syncUsersWithLoginList() : Promise.resolve(),
        typeof syncSpecialistsWithConfig === 'function' ? syncSpecialistsWithConfig() : Promise.resolve()
    ]);

    // Фильтры инициализируем только когда данные (из кэша или базы) уже в CONFIG
    if (typeof initFilters === 'function') {
        initFilters();
    }

}